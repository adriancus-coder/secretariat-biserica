"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { PrintSpec } from "@/domain/print";
import { FIT_FAILED, FIT_ONE_PAGE, fitMessage } from "@/lib/fit-layout";
import { parseStoredBlocks, type StoredBlock } from "@/lib/generated-blocks";
import { canSaveGenerated, GENERATED, isGeneratedKind, kindParams, type GeneratedKind } from "@/lib/generated-kinds";
import { DEFAULT_LAYOUT, layoutSummary, PAGE_LAYOUT_FIELDS, pageLayoutInput, pageLayoutSchema, storedLayout, type PageLayout } from "@/lib/page-layout";
import { idSchema } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";
import { writeAudit } from "../audit";
import { printSignatures } from "../document-signatures";
import { applyStored, HASH_VERSION, loadSource, sourceHash, type LoadedSource } from "../generated";
import { hasActivePastor } from "../pastor-approval";
import { documentSpec } from "../pdf/document";
import { fitToFewerPages, pageInfo } from "../pdf/fit";
import { meetingSpec } from "../pdf/meeting";
import { getChurch } from "../queries/church";
import { getDocument } from "../queries/documents";
import { getMeeting } from "../queries/meetings";
import { actionCtx, ActionError, type Ctx } from "../session";
import { hasStepUp } from "../step-up";
import { saveDocumentLayoutAction } from "./document-layout";
import { saveMeetingLayoutAction } from "./meeting-layout";

/*
 * FIT-TO-PAGE: the page count beside a preview, „Potrivește pe mai puține pagini” and „Revino la
 * așezarea obișnuită”, for the minutes' and the documents' „Așezare în pagină” and the GENERATED-EDIT
 * editor. The form says what is laid out (`tinta` pv | document | generat, with `id`, or the generated
 * source's `sursa`, `parametri`, `blocks`) and the layout shown (its fields). The result is saved as
 * that record's own layout through the usual saves (audited there); a closed minutes, a document
 * approved by the pastor or a registered act is never changed: the layout then serves only the download.
 */

export interface FitState {
  ok?: boolean;
  message?: string;
  from?: number;
  to?: number;
  layout?: PageLayout;
  /** Saved as the record's own layout (else it only applies to the preview and the download). */
  saved?: boolean;
}

export interface PageInfoState {
  pages?: number;
  /** The last page holds only the closing, or under 15 % of a page. */
  sparse?: boolean;
  message?: string;
}

interface Target {
  ctx: Ctx;
  spec: PrintSpec;
  /** The layout the form shows. */
  layout: PageLayout;
  /** Why the record cannot be changed (the result then serves only the download). */
  readOnly: string | null;
  save: (layout: PageLayout | null) => Promise<FormState>;
}

const layoutForm = (layout: PageLayout | null, scop: string) => {
  const fd = new FormData();
  fd.set("scop", scop);
  if (layout) for (const k of PAGE_LAYOUT_FIELDS) fd.set(k, k === "letterhead" ? (layout.letterhead ? "on" : "") : String(layout[k]));
  return fd;
};

function formLayout(form: FormData): PageLayout {
  const r = pageLayoutSchema.safeParse(pageLayoutInput(form));
  if (!r.success) throw new ActionError("Așezarea în pagină nu este completă. Verificați valorile.");
  return r.data;
}

/** What is laid out, with the guard of its page. */
async function target(form: FormData): Promise<Target> {
  const tinta = String(form.get("tinta") ?? "");
  const kind = form.get("sursa");
  // The guard of the page: the minutes' and the documents' layout need `write`, a generated document its source's permission.
  const ctx = await actionCtx(tinta === "generat" && isGeneratedKind(kind) ? GENERATED[kind].permission : "write");
  if (tinta === "pv") return meetingTarget(ctx, form);
  if (tinta === "document") return documentTarget(ctx, form);
  if (tinta === "generat") return generatedTarget(ctx, form);
  throw new ActionError("Document necunoscut.");
}

async function meetingTarget(ctx: Ctx, form: FormData): Promise<Target> {
  const id = String(form.get("id") ?? "");
  if (!idSchema.safeParse(id).success) throw new ActionError("Procesul-verbal nu există.");
  const [m, church] = await Promise.all([getMeeting(ctx, id), getChurch(ctx)]);
  if (!m) throw new ActionError("Procesul-verbal nu mai există.");
  return {
    ctx,
    spec: meetingSpec(m, church),
    layout: formLayout(form),
    readOnly: m.locked ? "Procesul-verbal este închis: așezarea se aplică doar descărcării, nu se salvează." : null,
    save: (layout) => saveMeetingLayoutAction(id, {}, layoutForm(layout, layout ? "pv" : "resetare")),
  };
}

async function documentTarget(ctx: Ctx, form: FormData): Promise<Target> {
  const id = String(form.get("id") ?? "");
  if (!idSchema.safeParse(id).success) throw new ActionError("Documentul nu există.");
  const [doc, church] = await Promise.all([getDocument(ctx, id), getChurch(ctx)]);
  if (!doc) throw new ActionError("Documentul nu mai există în registru.");
  if (doc.confidential && !(await hasStepUp(ctx.user))) throw new ActionError("Confirmați identitatea pe pagina documentului, apoi încercați din nou.");
  // Approved by the pastor (only while the church has one; otherwise there is no approval).
  const approved = doc.stare === "APROBAT" && (await hasActivePastor(ctx.user.churchId));
  return {
    ctx,
    spec: documentSpec({ ...doc, signatures: await printSignatures(doc.id) }, church),
    layout: formLayout(form),
    readOnly: approved ? "Documentul este aprobat de pastor: așezarea se aplică doar descărcării, nu se salvează." : null,
    save: (layout) => saveDocumentLayoutAction(id, {}, layoutForm(layout, layout ? "pv" : "resetare")),
  };
}

async function generatedTarget(ctx: Ctx, form: FormData): Promise<Target> {
  const kind = form.get("sursa");
  if (!isGeneratedKind(kind)) throw new ActionError("Documentul nu există.");
  const meta = GENERATED[kind];
  if (meta.discipline && !(await hasStepUp(ctx.user))) throw new ActionError("Confirmați identitatea, apoi încercați din nou.");
  const params = kindParams(kind, new URLSearchParams(String(form.get("parametri") ?? "")));
  const src = await loadSource(ctx, kind, params);
  if (!src) throw new ActionError("Documentul nu mai există.");
  const parsed = parseStoredBlocks(String(form.get("blocks") ?? ""));
  if (!parsed.ok) throw new ActionError(parsed.message);
  const spec = applyStored(src.spec, parsed.blocks, null);
  const usual = spec.layout ?? { ...DEFAULT_LAYOUT, format: spec.size ?? DEFAULT_LAYOUT.format };
  const layout = form.get("asezareProprie") === "on" ? formLayout(form) : usual;
  const existing = src.key ? await ctx.db.generatedDocument.findFirst({ where: { sourceKey: src.key }, select: { id: true, documentId: true } }) : null;
  const readOnly = !src.key
    ? "Inventarul cu poze se tipărește direct din date: așezarea se aplică doar descărcării."
    : existing?.documentId
      ? "Actul este înregistrat: așezarea se aplică doar descărcării, nu se salvează."
      : !canSaveGenerated(kind, ctx.user)
        ? "Așezarea se aplică doar previzualizării și descărcării; salvarea o fac secretariatul și administratorii."
        : null;
  return { ctx, spec, layout, readOnly, save: (l) => saveGeneratedLayout(ctx, kind, src, parsed.blocks, l) };
}

/** The generated document's own layout (the version is created with the editor's blocks when there is none). */
async function saveGeneratedLayout(ctx: Ctx, kind: GeneratedKind, src: LoadedSource, blocks: StoredBlock[], layout: PageLayout | null): Promise<FormState> {
  const key = src.key!;
  const existing = await ctx.db.generatedDocument.findFirst({ where: { sourceKey: key }, select: { id: true, layout: true } });
  const before = existing?.layout ? layoutSummary(storedLayout(existing.layout)) : "obișnuită";
  await ctx.db.$transaction(async (tx) => {
    const row = existing
      ? await tx.generatedDocument.update({ where: { id: existing.id }, data: { layout: layout ? (layout as object) : Prisma.DbNull, updatedById: ctx.user.id } })
      : await tx.generatedDocument.create({
          data: {
            churchId: ctx.user.churchId,
            kind,
            sourceKey: key,
            titlu: src.spec.title.slice(0, 300),
            blocks: blocks as object,
            layout: layout ?? Prisma.DbNull,
            sourceHash: sourceHash(src),
            hashVersion: HASH_VERSION,
            createdById: ctx.user.id,
            updatedById: ctx.user.id,
          } as never,
        });
    await writeAudit(tx, ctx.user, {
      entity: GENERATED[kind].discipline ? "DISCIPLINE" : "GENERATED",
      entityId: row.id,
      entityLabel: `${GENERATED[kind].label}${GENERATED[kind].discipline ? "" : `: ${src.spec.title}`}`,
      action: "UPDATE",
      fields: ["asezare"],
      before: { asezare: before },
      after: { asezare: layout ? layoutSummary(layout) : "obișnuită" },
    });
  });
  revalidatePath("/editare-document");
  return { ok: true };
}

/** The page count of the layout the form shows, and whether its last page is nearly empty. */
export async function pageInfoAction(form: FormData): Promise<PageInfoState> {
  try {
    const t = await target(form);
    return await pageInfo(t.spec, t.layout);
  } catch (e) {
    if (e instanceof ActionError) return { message: e.message };
    throw e;
  }
}

/**
 * „Potrivește pe mai puține pagini”: the first layout of fitSteps() that saves a page (src/server/pdf/fit.ts),
 * saved as the record's own layout unless it may not change; none → FIT_FAILED and nothing changes.
 */
export async function fitPagesAction(form: FormData): Promise<FitState> {
  try {
    const t = await target(form);
    const r = await fitToFewerPages(t.spec, t.layout);
    if (!r.ok) return { ok: false, from: r.from, message: r.from <= 1 ? FIT_ONE_PAGE : FIT_FAILED };
    const message = fitMessage(r.from, r.to);
    if (t.readOnly) return { ok: true, from: r.from, to: r.to, layout: r.layout, saved: false, message: `${message}. ${t.readOnly}` };
    const saved = await t.save(r.layout);
    if (!saved.ok) return { ok: false, message: saved.message ?? "Așezarea nu a putut fi salvată." };
    return { ok: true, from: r.from, to: r.to, layout: r.layout, saved: true, message };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, message: e.message };
    throw e;
  }
}

/** „Revino la așezarea obișnuită”: the layout before the fit (`inapoi=1` with its fields), or none of its own. */
export async function restoreLayoutAction(form: FormData): Promise<FitState> {
  try {
    const t = await target(form);
    if (t.readOnly) return { ok: false, message: t.readOnly };
    const previous = form.get("inapoi") === "1" ? t.layout : null;
    const saved = await t.save(previous);
    if (!saved.ok) return { ok: false, message: saved.message ?? "Așezarea nu a putut fi salvată." };
    return { ok: true, saved: true, message: "Documentul folosește din nou așezarea obișnuită.", ...(previous ? { layout: previous } : {}) };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, message: e.message };
    throw e;
  }
}
