import { z } from "zod";
import { idSchema, longText, requiredDate, requiredText, text } from "../validation";

export const GROUP_FIELDS = ["nume", "responsabil", "descriere", "membri"] as const;

export const groupSchema = z.object({
  nume: requiredText(120, "Numele grupului lipsește.", "Numele"),
  responsabil: text(160, "Responsabilul"),
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
