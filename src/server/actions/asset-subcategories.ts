"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { subcategoriesOf, SUBCATEGORY_NAME_MAX, usedText } from "@/lib/asset-subcategories";
import type { FormState } from "@/lib/form-state";
import { resolveNomen } from "@/lib/labels";
import { roleKey } from "@/lib/roles";
import { directionArg, idSchema, requiredText } from "@/lib/validation";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/*
 * PATRIMONY-SUBCATEGORIES: Setări → Categorii de patrimoniu (admin). Add, rename, reorder and delete the
 * subcategories of a category; a subcategory used by goods is deleted only after its goods are moved to
 * another subcategory of the same category (or explicitly left without one). Audited (SETTINGS; the goods
 * moved, ASSET).
 */

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const FIELDS = ["categorie", "subcategorie", "pozitie"];
const nameSchema = z.object({ nume: requiredText(SUBCATEGORY_NAME_MAX, "Scrieți denumirea subcategoriei.", "Denumirea") });
/** The delete form's choice: another subcategory's id, or "fara" (the goods stay without one). */
const MOVE_NONE = "fara";
const moveSchema = z.object({ mutaLa: z.union([z.literal(""), z.literal(MOVE_NONE), idSchema]).optional() });

const label = (s: { categorie: string; nume: string }) => `Subcategoria „${s.nume}” (${s.categorie})`;
const view = (s: { categorie: string; nume: string }, i: number) => ({ categorie: s.categorie, subcategorie: s.nume, pozitie: i + 1 });

async function siblings(tx: Tx, categorie: string) {
  return subcategoriesOf(await tx.assetSubcategory.findMany({ where: { categorie }, select: { id: true, categorie: true, nume: true, ordine: true } }), categorie);
}

function done(state: FormState): FormState {
  if (state.ok) {
    revalidatePath("/setari/patrimoniu");
    revalidatePath("/patrimoniu", "layout");
  }
  return state;
}

/** „+ Subcategorie” (id null, under `categorie`, which must be one of the church's categories) or rename. */
export async function saveSubcategoryAction(id: string | null, categorie: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  return done(
    await runFormAction(formData, async () => {
      const ctx = await actionCtx("admin");
      if (id !== null) parseOrThrow(idSchema, id);
      const { nume } = parseOrThrow(nameSchema, Object.fromEntries(formData));
      await ctx.db.$transaction(async (tx) => {
        const current = id ? await tx.assetSubcategory.findUnique({ where: { id } }) : null;
        if (id && !current) throw new ActionError("Subcategoria nu mai există.");
        const cat = current?.categorie ?? categorie ?? "";
        if (!current) {
          const church = await prisma.church.findUniqueOrThrow({ where: { id: ctx.user.churchId }, select: { categoriiPatrimoniu: true } });
          if (!resolveNomen({ categoriiPatrimoniu: church.categoriiPatrimoniu }).categoriiPatrimoniu.includes(cat)) throw new ActionError("Categoria nu mai există în nomenclator.");
        }
        const list = await siblings(tx, cat);
        if (list.some((s) => s.id !== id && roleKey(s.nume) === roleKey(nume))) throw new ValidationError({ nume: "Există deja o subcategorie cu această denumire în categorie." });
        if (current) {
          const index = list.findIndex((s) => s.id === id);
          await tx.assetSubcategory.update({ where: { id: current.id }, data: { nume } });
          await writeAudit(tx, ctx.user, { entity: "SETTINGS", entityId: current.id, entityLabel: label({ categorie: cat, nume }), action: "UPDATE", fields: FIELDS, before: view(current, index), after: view({ categorie: cat, nume }, index) });
          return;
        }
        const ordine = list.length ? Math.max(...list.map((s) => s.ordine)) + 1 : 0;
        const created = await tx.assetSubcategory.create({ data: { churchId: ctx.user.churchId, categorie: cat, nume, ordine } });
        await writeAudit(tx, ctx.user, { entity: "SETTINGS", entityId: created.id, entityLabel: label(created), action: "CREATE", fields: FIELDS, after: view(created, list.length) });
      });
      return { ok: true, message: id ? "Subcategoria a fost redenumită." : "Subcategoria a fost adăugată." };
    }),
  );
}

/** ↑ / ↓ inside the category. */
export async function moveSubcategoryAction(id: string, direction: "up" | "down"): Promise<FormState> {
  return done(
    await runFormAction(null, async () => {
      const ctx = await actionCtx("admin");
      parseOrThrow(idSchema, id);
      parseOrThrow(directionArg, direction);
      await ctx.db.$transaction(async (tx) => {
        const s = await tx.assetSubcategory.findUnique({ where: { id }, select: { categorie: true } });
        if (!s) throw new ActionError("Subcategoria nu mai există.");
        const list = await siblings(tx, s.categorie);
        const from = list.findIndex((x) => x.id === id);
        const to = direction === "up" ? from - 1 : from + 1;
        if (to < 0 || to >= list.length) return;
        const next = [...list];
        [next[from], next[to]] = [next[to], next[from]];
        for (const [i, x] of next.entries()) if (x.ordine !== i) await tx.assetSubcategory.update({ where: { id: x.id }, data: { ordine: i } });
        await writeAudit(tx, ctx.user, { entity: "SETTINGS", entityId: id, entityLabel: label(list[from]), action: "UPDATE", fields: FIELDS, before: view(list[from], from), after: view(list[from], to) });
      });
    }),
  );
}

/**
 * „Șterge”. A subcategory used by goods is refused („Folosită la N bunuri”) unless the form names where its
 * goods go (`mutaLa`: another subcategory of the same category, or "fara"); then the goods are moved
 * (each audited) and the subcategory deleted, in one transaction.
 */
export async function deleteSubcategoryAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return done(
    await runFormAction(formData, async () => {
      const ctx = await actionCtx("admin");
      parseOrThrow(idSchema, id);
      const { mutaLa = "" } = parseOrThrow(moveSchema, Object.fromEntries(formData));
      let moved = 0;
      await ctx.db.$transaction(async (tx) => {
        const s = await tx.assetSubcategory.findUnique({ where: { id } });
        if (!s) throw new ActionError("Subcategoria nu mai există.");
        const goods = await tx.asset.findMany({ where: { subcategoryId: id }, select: { id: true, nrInventar: true, denumire: true } });
        if (goods.length) {
          if (!mutaLa) throw new ValidationError({ mutaLa: `${usedText(goods.length)}. Alegeți întâi unde se mută bunurile.` });
          const target = mutaLa === MOVE_NONE ? null : await tx.assetSubcategory.findUnique({ where: { id: mutaLa } });
          if (mutaLa !== MOVE_NONE && (!target || target.id === id || target.categorie !== s.categorie)) throw new ValidationError({ mutaLa: "Alegeți o altă subcategorie din aceeași categorie." });
          await tx.asset.updateMany({ where: { subcategoryId: id }, data: { subcategoryId: target?.id ?? null } });
          for (const g of goods) {
            await writeAudit(tx, ctx.user, {
              entity: "ASSET",
              entityId: g.id,
              entityLabel: `Nr. inv. ${g.nrInventar} — ${g.denumire}`,
              action: "UPDATE",
              fields: ["subcategorie"],
              before: { subcategorie: s.nume },
              after: { subcategorie: target?.nume ?? "" },
            });
          }
          moved = goods.length;
        }
        const index = (await siblings(tx, s.categorie)).findIndex((x) => x.id === id);
        await tx.assetSubcategory.delete({ where: { id } });
        await writeAudit(tx, ctx.user, { entity: "SETTINGS", entityId: id, entityLabel: label(s), action: "DELETE", fields: FIELDS, before: view(s, index), extra: moved ? { observatie: `${moved} ${moved === 1 ? "bun mutat" : "bunuri mutate"}` } : undefined });
      });
      return { ok: true, message: moved ? `Subcategoria a fost ștearsă; ${moved === 1 ? "1 bun a fost mutat" : `${moved} bunuri au fost mutate`}.` : "Subcategoria a fost ștearsă." };
    }),
  );
}
