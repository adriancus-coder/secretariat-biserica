"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { pastoralNoteSchema } from "@/lib/schemas/pastoral-note";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { encryptNote } from "../pastoral-notes";
import { actionCtx, ActionError, type Ctx } from "../session";
import { hasStepUp, STEP_UP_REQUIRED } from "../step-up";
import { parseOrThrow, runFormAction } from "./run";

/** Pastors only, after the step-up; the person must be this church's. */
async function pastoralCtx(personId: string): Promise<{ ctx: Ctx; name: string }> {
  const ctx = await actionCtx("pastoral");
  parseOrThrow(idSchema, personId);
  if (!(await hasStepUp(ctx.user))) throw new ActionError(STEP_UP_REQUIRED);
  const person = await ctx.db.person.findUnique({ where: { id: personId }, select: { nume: true, prenume: true } });
  if (!person) throw new ActionError("Persoana nu mai există în registru.");
  return { ctx, name: memberName(person) };
}

/**
 * Adds a pastoral note, or changes one of the pastor's own. The log keeps only that a note was
 * added / changed, by whom and for whom — never the text.
 */
export async function savePastoralNoteAction(personId: string, noteId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const { ctx, name } = await pastoralCtx(personId);
    if (noteId !== null) parseOrThrow(idSchema, noteId);
    const { text } = parseOrThrow(pastoralNoteSchema, { text: String(formData.get("text") ?? "") });
    await ctx.db.$transaction(async (tx) => {
      if (noteId) {
        const r = await tx.pastoralNote.updateMany({ where: { id: noteId, personId, createdByUserId: ctx.user.id }, data: { textEnc: encryptNote(text) } });
        if (r.count !== 1) throw new ActionError("Puteți modifica doar notele scrise de dumneavoastră.");
      } else {
        await tx.pastoralNote.create({ data: { churchId: ctx.user.churchId, personId, textEnc: encryptNote(text), createdByUserId: ctx.user.id } });
      }
      await writeAudit(tx, ctx.user, {
        entity: "PASTORAL",
        entityId: personId,
        entityLabel: name,
        action: noteId ? "UPDATE" : "CREATE",
        fields: [],
        extra: { observatie: noteId ? "notă pastorală modificată" : "notă pastorală adăugată" },
      });
    });
    return { ok: true, message: noteId ? "Nota a fost modificată." : "Nota a fost adăugată." };
  });
  if (state.ok) revalidatePath(`/persoane/${personId}`);
  // The text never travels back in the form state.
  return { ...state, values: state.ok ? undefined : state.values };
}

/** Deletes one of the pastor's own notes (audited without the text). */
export async function deletePastoralNoteAction(personId: string, noteId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const { ctx, name } = await pastoralCtx(personId);
    parseOrThrow(idSchema, noteId);
    await ctx.db.$transaction(async (tx) => {
      const r = await tx.pastoralNote.deleteMany({ where: { id: noteId, personId, createdByUserId: ctx.user.id } });
      if (r.count !== 1) throw new ActionError("Puteți șterge doar notele scrise de dumneavoastră.");
      await writeAudit(tx, ctx.user, { entity: "PASTORAL", entityId: personId, entityLabel: name, action: "DELETE", fields: [], extra: { observatie: "notă pastorală ștearsă" } });
    });
    return { ok: true, message: "Nota a fost ștearsă." };
  });
  if (state.ok) revalidatePath(`/persoane/${personId}`);
  return state;
}
