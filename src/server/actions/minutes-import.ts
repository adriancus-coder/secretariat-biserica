"use server";

import { parseMinutesText } from "@/domain/minutes-parse";
import type { FormState } from "@/lib/form-state";
import type { ImportDraft } from "@/lib/minutes-import";
import { DOCX_MAX_FILES, docxText, DocxError, reviewDraft } from "../minutes-import";
import { actionCtx, ActionError } from "../session";
import { runFormAction } from "./run";

export interface DocxImportState extends FormState {
  drafts?: ImportDraft[];
  /** Files that could not be read, with the reason. */
  skipped?: string[];
}

/**
 * "Importă din Word": one or more .docx minutes (≤ 5 MB each, ≤ 30 per batch), read in memory
 * with mammoth and parsed locally (no network). Nothing is saved here: each draft is reviewed
 * and saved with the meeting form.
 */
export async function importDocxMinutesAction(_prev: DocxImportState, formData: FormData): Promise<DocxImportState> {
  const drafts: ImportDraft[] = [];
  const skipped: string[] = [];
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    const files = formData.getAll("fisiere").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new ActionError("Alegeți cel puțin un fișier .docx.");
    if (files.length > DOCX_MAX_FILES) throw new ActionError(`Cel mult ${DOCX_MAX_FILES} de fișiere odată.`);
    for (const file of files) {
      try {
        const { draft, warnings } = parseMinutesText(await docxText(file));
        drafts.push(await reviewDraft(ctx, file.name, draft, warnings));
      } catch (e) {
        if (!(e instanceof DocxError)) throw e;
        skipped.push(e.message);
      }
    }
    if (!drafts.length) throw new ActionError("Niciun fișier nu a putut fi citit.");
  });
  return drafts.length ? { ok: true, drafts, skipped } : { ...state, skipped };
}
