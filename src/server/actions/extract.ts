"use server";

import { randomUUID } from "node:crypto";
import type { FormState } from "@/lib/form-state";
import type { ImportDraft } from "@/lib/minutes-import";
import { declaredKind } from "@/lib/file-type";
import { EXTRACT_MAX_BYTES, type PersonDraft } from "@/lib/schemas/extract";
import { writeAudit } from "../audit";
import { checkExtractFile, extractDocument, ExtractError, type ExtractKind } from "../extract";
import { reviewDraft } from "../minutes-import";
import { sharedRateLimiter } from "../rate-limit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { runFormAction } from "./run";

const DAY_MS = 24 * 60 * 60 * 1000;
const KIND_LABEL: Record<ExtractKind, string> = { "proces-verbal": "proces-verbal", persoana: "persoană" };

/** The uploaded file, checked, counted against the church's daily limit and written to the audit log. */
async function readUpload(ctx: Ctx, kind: ExtractKind, formData: FormData) {
  // Off until an administrator accepted the processing by Anthropic (Setări → Confidențialitate).
  const church = await ctx.db.church.findUnique({ where: { id: ctx.user.churchId }, select: { extractEnabled: true } });
  if (!church?.extractEnabled) throw new ActionError("Citirea automată a documentelor nu este pornită. Administratorul o poate porni din Setări.");
  const file = formData.get("fisier");
  if (!(file instanceof File)) throw new ActionError("Alegeți un fișier.");
  if (file.size > EXTRACT_MAX_BYTES) throw new ActionError("Fișierul depășește 20 MB.");
  const data = Buffer.from(await file.arrayBuffer());
  try {
    checkExtractFile(data, declaredKind(file.name, file.type));
  } catch (e) {
    if (e instanceof ExtractError) throw new ActionError(e.message);
    throw e;
  }
  // 60 extractions per church per day (in memory, like the other limits).
  if (!sharedRateLimiter("extract", { limit: 60, windowMs: DAY_MS }).hit(ctx.user.churchId)) {
    throw new ActionError("S-a atins limita de 60 de documente citite pe zi. Încercați din nou mâine.");
  }
  await writeAudit(ctx.db, ctx.user, {
    entity: "EXTRACT",
    entityId: randomUUID(),
    entityLabel: `Citire ${KIND_LABEL[kind]}: ${file.name}`.slice(0, 300),
    action: "CREATE",
    fields: ["tip", "fisier", "marime"],
    after: { tip: KIND_LABEL[kind], fisier: file.name.slice(0, 200), marime: `${Math.max(1, Math.round(file.size / 1024))} KB` },
  });
  return { data, fileName: file.name };
}

/** The extraction, with its messages shown in the form. */
function asActionError(e: unknown): never {
  throw e instanceof ExtractError ? new ActionError(e.message) : e;
}

export interface ExtractPersonState extends FormState {
  draft?: PersonDraft;
}

/** "Adaugă din document": reads a transfer certificate or membership application into a person draft. */
export async function extractPersonAction(_prev: ExtractPersonState, formData: FormData): Promise<ExtractPersonState> {
  let draft: PersonDraft | undefined;
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    draft = await extractDocument("persoana", await readUpload(ctx, "persoana", formData)).catch(asActionError);
  });
  return draft ? { ok: true, draft } : state;
}

export interface ExtractMinutesState extends FormState {
  meeting?: ImportDraft;
}

/** Reads a scanned or photographed minutes page into a review draft. */
export async function extractMinutesAction(_prev: ExtractMinutesState, formData: FormData): Promise<ExtractMinutesState> {
  let meeting: ImportDraft | undefined;
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    const upload = await readUpload(ctx, "proces-verbal", formData);
    const draft = await extractDocument("proces-verbal", upload).catch(asActionError);
    meeting = await reviewDraft(ctx, upload.fileName, draft, draft.data ? [] : ["Data ședinței nu a putut fi citită; verificați-o."]);
  });
  return meeting ? { ok: true, meeting } : state;
}
