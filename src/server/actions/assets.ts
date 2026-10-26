"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { ASSET_ORIGIN_LABEL, ASSET_STATE_LABEL } from "@/lib/patrimony";
import { ASSET_FIELDS, assetSchema, retireSchema } from "@/lib/schemas/asset";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** The audit view of a good: labels and names instead of keys and ids. */
async function view(tx: Tx, id: string) {
  const a = await tx.asset.findUnique({ where: { id }, include: { responsabilP: { select: { nume: true, prenume: true } } } });
  if (!a) return null;
  return {
    nrInventar: a.nrInventar,
    denumire: a.denumire,
    categorie: a.categorie,
    cantitate: a.cantitate,
    valoare: a.valoare,
    dataIntrarii: fromDbDate(a.dataIntrarii),
    provenienta: ASSET_ORIGIN_LABEL[a.provenienta],
    loc: a.loc,
    stare: ASSET_STATE_LABEL[a.stare],
    dataIesirii: fromDbDate(a.dataIesirii),
    motivIesirii: a.motivIesirii,
    observatii: a.observatii,
    responsabil: a.responsabilP ? memberName(a.responsabilP) : a.responsabil,
  };
}
const label = (v: { nrInventar: number; denumire: string }) => `Nr. inv. ${v.nrInventar} — ${v.denumire}`;

/**
 * "+ Bun nou" and editing (write roles; Statut art. 43 alin. 7). The inventory number is the next free one
 * or the one typed, if free; the responsible person is checked against the church. A good out of use is
 * not edited here. Audited (ASSET).
 */
export async function saveAssetAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = parseOrThrow(assetSchema, Object.fromEntries(formData));
    if (input.responsabilId && !(await ctx.db.person.findUnique({ where: { id: input.responsabilId }, select: { id: true } }))) throw new ValidationError({ responsabilId: "Persoana nu mai există în registru." });
    const data = {
      denumire: input.denumire,
      categorie: input.categorie,
      cantitate: input.cantitate ?? 1,
      valoare: input.valoare,
      dataIntrarii: toDbDate(input.dataIntrarii),
      provenienta: input.provenienta,
      loc: input.loc,
      stare: input.stare,
      observatii: input.observatii,
      responsabil: input.responsabilId ? "" : input.responsabil,
      responsabilId: input.responsabilId,
    };
    savedId = await ctx.db.$transaction(async (tx) => {
      const before = id ? await view(tx, id) : null;
      if (id && !before) throw new ActionError("Bunul nu mai există în inventar.");
      if (id && before!.stare === ASSET_STATE_LABEL.SCOS_DIN_UZ) throw new ActionError("Bunul a fost scos din uz și nu se mai modifică.");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inv-nr:${ctx.user.churchId}`}))`;
      const nr = input.nrInventar ?? (id ? before!.nrInventar : ((await tx.asset.aggregate({ _max: { nrInventar: true } }))._max.nrInventar ?? 0) + 1);
      const taken = await tx.asset.findFirst({ where: { nrInventar: nr, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
      if (taken) throw new ValidationError({ nrInventar: `Numărul de inventar ${nr} este deja folosit.` });
      const row = id ? await tx.asset.update({ where: { id }, data: { ...data, nrInventar: nr } }) : await tx.asset.create({ data: { ...data, nrInventar: nr, churchId: ctx.user.churchId, createdById: ctx.user.id } });
      const after = await view(tx, row.id);
      await writeAudit(tx, ctx.user, { entity: "ASSET", entityId: row.id, entityLabel: label(after!), action: id ? "UPDATE" : "CREATE", fields: ASSET_FIELDS, before, after });
      return row.id;
    });
  });
  if (!savedId) return state;
  revalidatePath("/", "layout");
  redirect(`/patrimoniu/${savedId}?salvat=1`);
}

/** "Scoate din uz": the date and the reason; the good stays in the inventory's history (never deleted). Audited. */
export async function retireAssetAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let done = false;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    const input = parseOrThrow(retireSchema, Object.fromEntries(formData));
    await ctx.db.$transaction(async (tx) => {
      const before = await view(tx, id);
      if (!before) throw new ActionError("Bunul nu mai există în inventar.");
      if (before.stare === ASSET_STATE_LABEL.SCOS_DIN_UZ) throw new ActionError("Bunul este deja scos din uz.");
      await tx.asset.update({ where: { id }, data: { stare: "SCOS_DIN_UZ", dataIesirii: toDbDate(input.dataIesirii), motivIesirii: input.motivIesirii } });
      await writeAudit(tx, ctx.user, { entity: "ASSET", entityId: id, entityLabel: label(before), action: "UPDATE", fields: ASSET_FIELDS, before, after: await view(tx, id) });
    });
    done = true;
  });
  if (!done) return state;
  revalidatePath("/", "layout");
  redirect(`/patrimoniu/${id}?salvat=1&mesaj=${encodeURIComponent("Bunul a fost scos din uz.")}`);
}
