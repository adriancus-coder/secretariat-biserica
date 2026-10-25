"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { FormState } from "@/lib/form-state";
import { excerptsField, excerptsText, isDefaultExcerpts, storedExcerpts, type StatuteExcerpt } from "@/lib/statute-excerpts";
import { looksLikePdf, STATUTE, STATUTE_KINDS, STATUTE_MAX_BYTES, type StatuteKind } from "@/lib/statutes";
import { writeAudit } from "../audit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const FIELD: Record<StatuteKind, string> = { STATUT_CULT: "statutCult", STATUT_INTERN: "statutIntern" };

function checkKind(kind: string): StatuteKind {
  if (!(STATUTE_KINDS as readonly string[]).includes(kind)) throw new ActionError("Document necunoscut.");
  return kind as StatuteKind;
}

/** The audit view of one statute: its file name and size, never the content. */
async function view(tx: Tx, kind: StatuteKind): Promise<Record<string, string>> {
  const d = await tx.churchDocument.findFirst({ where: { kind }, select: { fileName: true, size: true } });
  return { [FIELD[kind]]: d ? `${d.fileName} (${Math.max(1, Math.round(d.size / 1024))} KB)` : "" };
}

/** Uploads or replaces a statute (PDF, ≤ 10 MB), stored in the database. Administrators only. */
export async function uploadStatuteAction(kind: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    const k = checkKind(kind);
    const file = formData.get("fisier");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Alegeți fișierul PDF.");
    if (file.size > STATUTE_MAX_BYTES) throw new ActionError("Fișierul depășește 10 MB.");
    const pdf = new Uint8Array(await file.arrayBuffer());
    if (!looksLikePdf(pdf)) throw new ActionError("Fișierul nu este un PDF.");
    const fileName = file.name.replace(/[\\/]/g, "_").slice(0, 200) || "statut.pdf";
    await ctx.db.$transaction(async (tx) => {
      const before = await view(tx, k);
      const existing = await tx.churchDocument.findFirst({ where: { kind: k }, select: { id: true } });
      const data = { fileName, size: pdf.length, pdf, uploadedAt: new Date(), uploadedById: ctx.user.id };
      if (existing) await tx.churchDocument.update({ where: { id: existing.id }, data });
      else await tx.churchDocument.create({ data: { ...data, kind: k, churchId: ctx.user.churchId } });
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: STATUTE[k].label,
        action: "UPDATE",
        fields: [FIELD[k]],
        before,
        after: await view(tx, k),
      });
    });
    revalidatePath("/setari");
    return { ok: true, message: `${STATUTE[k].label} a fost încărcat.` };
  });
}

export async function deleteStatuteAction(kind: string): Promise<FormState> {
  return runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    const k = checkKind(kind);
    await ctx.db.$transaction(async (tx) => {
      const before = await view(tx, k);
      const { count } = await tx.churchDocument.deleteMany({ where: { kind: k } });
      if (!count) return;
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: STATUTE[k].label,
        action: "UPDATE",
        fields: [FIELD[k]],
        before,
        after: { [FIELD[k]]: "" },
      });
    });
    revalidatePath("/setari");
    return { ok: true, message: `${STATUTE[k].label} a fost șters.` };
  });
}

/** Saves the statute excerpts of the application form (the defaults are stored as []); audited SETTINGS. */
async function saveExcerpts(ctx: Ctx, list: StatuteExcerpt[] | null) {
  await ctx.db.$transaction(async (tx) => {
    const before = await tx.church.findUniqueOrThrow({ where: { id: ctx.user.churchId }, select: { nume: true, statutExtrase: true } });
    const stored = list && !isDefaultExcerpts(list) ? list : [];
    await tx.church.update({ where: { id: ctx.user.churchId }, data: { statutExtrase: stored as unknown as Prisma.InputJsonArray } });
    await writeAudit(tx, ctx.user, {
      entity: "SETTINGS",
      entityId: ctx.user.churchId,
      entityLabel: before.nume,
      action: "UPDATE",
      fields: ["extraseStatut"],
      before: { extraseStatut: excerptsText(storedExcerpts(before.statutExtrase)) },
      after: { extraseStatut: excerptsText(storedExcerpts(stored)) },
    });
  });
}

/** Setări → "Extrase din statut afișate în cererea de membru" (administrators). */
export async function saveStatuteExcerptsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    const list = parseOrThrow(z.object({ extrase: excerptsField }), { extrase: String(formData.get("extrase") ?? "") }).extrase;
    await saveExcerpts(ctx, list);
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  return { ok: true, message: "Extrasele au fost salvate." };
}

/** "Revino la textul implicit": the defaults of docs/statut-extrase.md (administrators). */
export async function resetStatuteExcerptsAction(): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    await saveExcerpts(await actionCtx("admin"), null);
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  return { ok: true, message: "S-a revenit la textul implicit." };
}
