"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIso, toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { parseStoredBlocks, storedToRich, type StoredBlock } from "@/lib/generated-blocks";
import { canSaveGenerated, GENERATED, generatedEditorUrl, isGeneratedKind, kindParams, type GeneratedKind } from "@/lib/generated-kinds";
import { pageLayoutInput, pageLayoutSchema, type PageLayout } from "@/lib/page-layout";
import { richToPlain } from "@/lib/rich-text";
import { writeAudit } from "../audit";
import { lockDocumentRegister, nextFreeNumber } from "../doc-numbering";
import { loadSource, sourceHash } from "../generated";
import { hasActivePastor } from "../pastor-approval";
import { actionCtx, ActionError, type Ctx } from "../session";
import { hasStepUp } from "../step-up";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/*
 * GENERATED-EDIT: save the edited version of a generated document, remake it from the data, or register
 * an official act (a numbered document in Documente, with the pastor's approval and the register's
 * exit). The source's permission is checked again here (plus a write role, or `disciplina` + step-up for
 * the disciplinary acts); the audit log never holds the content.
 */

async function open(kind: unknown, query: string) {
  if (!isGeneratedKind(kind)) throw new ActionError("Documentul nu mai există.");
  const meta = GENERATED[kind];
  const ctx = await actionCtx(meta.permission);
  if (!canSaveGenerated(kind, ctx.user)) throw new ActionError("Nu aveți dreptul să salvați acest document.");
  if (meta.discipline && !(await hasStepUp(ctx.user))) throw new ActionError("Confirmați identitatea, apoi încercați din nou.");
  const params = kindParams(kind, new URLSearchParams(query));
  const src = await loadSource(ctx, kind, params);
  if (!src) throw new ActionError("Documentul nu mai există.");
  if (!src.key) throw new ActionError("Acest document nu se poate edita.");
  return { ctx, meta, kind, params, src, key: src.key };
}

/** DISCIPLINE for the disciplinary acts (hidden from everyone else's log), GENERATED otherwise. */
const auditEntity = (kind: GeneratedKind) => (GENERATED[kind].discipline ? ("DISCIPLINE" as const) : ("GENERATED" as const));

function layoutOf(formData: FormData): PageLayout | null {
  if (formData.get("asezareProprie") !== "on") return null;
  return parseOrThrow(pageLayoutSchema, pageLayoutInput(formData));
}

function blocksOf(formData: FormData): StoredBlock[] {
  const r = parseStoredBlocks(String(formData.get("blocks") ?? ""));
  if (!r.ok) throw new ValidationError({ blocks: r.message });
  return r.blocks;
}

async function write(o: Awaited<ReturnType<typeof open>>, blocks: StoredBlock[], layout: PageLayout | null) {
  const { ctx, kind, src, key } = o;
  const existing = await ctx.db.generatedDocument.findFirst({ where: { sourceKey: key }, select: { id: true, documentId: true } });
  if (existing?.documentId) throw new ActionError("Actul este înregistrat; se modifică din Documente.");
  const data = { kind, titlu: src.spec.title.slice(0, 300), blocks: blocks as object, layout: layout ?? undefined, sourceHash: sourceHash(src.spec), updatedById: ctx.user.id };
  return ctx.db.$transaction(async (tx) => {
    const row = existing
      ? await tx.generatedDocument.update({ where: { id: existing.id }, data: { ...data, layout: layout ?? null } as never })
      : await tx.generatedDocument.create({ data: { ...data, sourceKey: key, createdById: ctx.user.id, churchId: ctx.user.churchId } as never });
    await writeAudit(tx, ctx.user, {
      entity: auditEntity(kind),
      entityId: row.id,
      entityLabel: `${GENERATED[kind].label}${GENERATED[kind].discipline ? "" : `: ${src.spec.title}`}`,
      action: existing ? "UPDATE" : "CREATE",
      fields: [],
      extra: { observatie: existing ? "versiune editată salvată din nou" : "versiune editată salvată" },
    });
    return row;
  });
}

/** „Salvează” (and „Înregistrează” for an official act: the pressed button's `scop`). */
export async function saveGeneratedAction(kind: string, query: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let target: string | undefined;
  const state = await runFormAction(formData, async () => {
    const o = await open(kind, query);
    const blocks = blocksOf(formData);
    const layout = layoutOf(formData);
    const row = await write(o, blocks, layout);
    if (formData.get("scop") !== "inregistrare") {
      target = `${generatedEditorUrl(o.kind, o.params)}&salvat=1`;
      return;
    }
    if (!o.meta.official) throw new ActionError("Acest document nu se înregistrează.");
    const docId = await registerAct(o.ctx, o, row.id, blocks);
    target = `/documente/${docId}?inregistrat=1`;
  });
  if (!target) return state;
  revalidatePath("/", "layout");
  redirect(target);
}

/**
 * „Înregistrează”: the act becomes a numbered document (the register's number and year, the pastor's
 * approval while the church has a pastor user, the register's exit), confidential: only `disciplina`
 * users see it. The saved version is then read-only.
 */
async function registerAct(ctx: Ctx, o: Awaited<ReturnType<typeof open>>, generatedId: string, blocks: StoredBlock[]): Promise<string> {
  const data = todayIso();
  const year = Number(data.slice(0, 4));
  const textRich = storedToRich(blocks);
  const approval = await hasActivePastor(ctx.user.churchId);
  return ctx.db.$transaction(async (tx) => {
    const g = await tx.generatedDocument.findFirst({ where: { id: generatedId }, select: { documentId: true } });
    if (g?.documentId) throw new ActionError("Actul este deja înregistrat.");
    await lockDocumentRegister(tx, ctx.user.churchId, year);
    const nr = await nextFreeNumber(tx, ctx.user.churchId, year);
    const doc = await tx.document.create({
      data: {
        churchId: ctx.user.churchId,
        tip: "scrisoare",
        nr,
        anRegistru: year,
        data: toDbDate(data)!,
        personId: o.src.person?.id ?? null,
        persoana: o.src.person?.name ?? "",
        catre: o.src.person?.name ?? "",
        titlu: GENERATED[o.kind].label,
        text: richToPlain(textRich),
        textRich: textRich as object,
        confidential: true,
        stare: approval ? "CIORNA" : "APROBAT",
      },
    });
    await tx.generatedDocument.update({ where: { id: generatedId }, data: { documentId: doc.id } });
    await writeAudit(tx, ctx.user, {
      entity: auditEntity(o.kind),
      entityId: generatedId,
      entityLabel: GENERATED[o.kind].label,
      action: "UPDATE",
      fields: [],
      extra: { observatie: `înregistrat cu nr. ${nr}/${year}` },
    });
    return doc.id;
  });
}

/** „Reface din date”: the saved version goes (asked first in the app); the document is generated from the data again. */
export async function resetGeneratedAction(kind: string, query: string, returnTo: "editor" | "sursa" = "editor"): Promise<FormState> {
  let back: string | undefined;
  const state = await runFormAction(null, async () => {
    const o = await open(kind, query);
    const existing = await o.ctx.db.generatedDocument.findFirst({ where: { sourceKey: o.key }, select: { id: true, documentId: true } });
    if (!existing) return { ok: true, message: "Nu există o versiune editată." };
    if (existing.documentId) throw new ActionError("Actul este înregistrat; se modifică din Documente.");
    await o.ctx.db.$transaction(async (tx) => {
      await tx.generatedDocument.delete({ where: { id: existing.id } });
      await writeAudit(tx, o.ctx.user, {
        entity: auditEntity(o.kind),
        entityId: existing.id,
        entityLabel: `${GENERATED[o.kind].label}${GENERATED[o.kind].discipline ? "" : `: ${o.src.spec.title}`}`,
        action: "DELETE",
        fields: [],
        extra: { observatie: "refăcut din date (versiunea editată ștearsă)" },
      });
    });
    const done = `salvat=1&mesaj=${encodeURIComponent("Documentul a fost refăcut din date.")}`;
    back = returnTo === "sursa" ? `${o.src.backHref}${o.src.backHref.includes("?") ? "&" : "?"}${done}` : `${generatedEditorUrl(o.kind, o.params)}&${done}`;
  });
  if (!back) return state;
  revalidatePath("/", "layout");
  redirect(back);
}
