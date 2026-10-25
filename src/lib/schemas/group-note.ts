import { z } from "zod";
import { idSchema, longText, requiredDate, requiredText, text } from "../validation";

export const GROUP_FIELDS = ["nume", "functie", "functieLider", "responsabil", "descriere", "membri"] as const;

const optionalGroupId = z.preprocess((v) => (v === null || v === undefined || v === "" ? null : v), idSchema.nullable());

export const groupSchema = z.object({
  nume: requiredText(120, "Numele grupului lipsește.", "Numele"),
  /** "Slujirea grupului": the ministry (church role) the group belongs to. */
  functieId: optionalGroupId,
  /** "Funcția de conducere": the role whose holders lead the group. */
  functieLiderId: optionalGroupId,
  /** The responsible person from the register ("" = none); `responsabil` keeps an older free text. */
  responsabilId: optionalGroupId,
  responsabil: text(160, "Responsabilul"),
  /** "Adaugă-l și în grup": a responsible person who is not a member is added as a manual member. */
  adaugaResponsabil: z.preprocess((v) => v === "on" || v === "1" || v === true, z.boolean()),
  descriere: longText(5000, "Descrierea"),
  membri: z.array(idSchema).max(5000),
});

export function groupFormInput(formData: FormData) {
  return { ...Object.fromEntries(formData), membri: formData.getAll("membri").map(String) };
}

export const NOTE_FIELDS = ["data", "tip", "persoana", "familie", "text"] as const;

const optionalId = z.preprocess((v) => (v === null || v === undefined || v === "" ? null : v), idSchema.nullable());

export const noteSchema = z.object({
  data: requiredDate("Data este obligatorie."),
  tip: requiredText(80, "Alegeți tipul mențiunii."),
  personId: optionalId,
  familie: text(100, "Familia"),
  text: longText(20000, "Textul").pipe(z.string().min(1, "Textul lipsește.")),
});
