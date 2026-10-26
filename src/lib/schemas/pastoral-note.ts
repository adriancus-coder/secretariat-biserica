import { z } from "zod";

/** A pastoral note (Statut art. 39 alin. 3): plain text, at most 10 000 characters. */
export const PASTORAL_NOTE_MAX = 10_000;

export const pastoralNoteSchema = z.object({
  text: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Scrieți nota.").max(PASTORAL_NOTE_MAX, `Nota poate avea cel mult ${PASTORAL_NOTE_MAX} de caractere.`)),
});
