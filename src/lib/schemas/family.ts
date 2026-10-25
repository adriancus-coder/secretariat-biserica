import { z } from "zod";
import { FAMILY_NAME_MAX, NEW_FAMILY } from "../families";
import { idSchema, longText, requiredText, text } from "../validation";

export const familySchema = z.object({
  nume: requiredText(FAMILY_NAME_MAX, "Numele familiei este obligatoriu.", "Numele"),
  adresa: text(200, "Adresa"),
  note: longText(2000, "Notele"),
  headId: z.string().refine((s) => idSchema.safeParse(s).success, "Alegeți capul familiei."),
});

/** "Mută persoana în altă familie": a family id or NEW_FAMILY. */
export const moveTargetSchema = z.object({
  tinta: z.string().refine((s) => s === NEW_FAMILY || idSchema.safeParse(s).success, "Alegeți familia."),
});
