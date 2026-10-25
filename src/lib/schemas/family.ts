import { z } from "zod";
import { FAMILY_NAME_MAX, NEW_FAMILY } from "../families";
import { idSchema, longText, requiredText, text } from "../validation";

export const familySchema = z.object({
  nume: requiredText(FAMILY_NAME_MAX, "Numele familiei este obligatoriu.", "Numele"),
  adresa: text(200, "Adresa"),
  note: longText(2000, "Notele"),
  /** "" only for a family without adults (no one can be head). */
  headId: z
    .string()
    .refine((s) => s === "" || idSchema.safeParse(s).success, "Alegeți capul familiei.")
    .transform((s) => s || null),
});

/** "Mută persoana în altă familie": a family id or NEW_FAMILY. */
export const moveTargetSchema = z.object({
  tinta: z.string().refine((s) => s === NEW_FAMILY || idSchema.safeParse(s).success, "Alegeți familia."),
});

/**
 * "Adaugă membri": the persons chosen (without a family), each with an optional kinship, as JSON in
 * the hidden field `membri`: `[{ "id": "<personId>", "rudenie": "Fiu" }]`.
 */
export const addMembersSchema = z.object({
  membri: z.preprocess(
    (v) => {
      if (typeof v !== "string" || !v) return [];
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    },
    z
      .array(z.object({ id: idSchema, rudenie: text(60, "Gradul de rudenie") }), { error: "Lista de persoane este invalidă." })
      .min(1, "Alegeți cel puțin o persoană.")
      .max(50, "Cel mult 50 de persoane odată."),
  ),
});

/** "Adaugă la familia…": an existing family and the person's kinship in it. */
export const joinFamilySchema = z.object({
  familyId: z.string().refine((s) => idSchema.safeParse(s).success, "Alegeți familia."),
  rudenie: text(60, "Gradul de rudenie"),
});
