import { z } from "zod";
import { categoryDef } from "@/domain/categories";
import { EXPORT_COLUMN_KEYS, EXPORT_FORMATS, EXPORT_SORTS, type ExportColumn } from "../person-export";
import { AGE_FILTERS, GENDER_FILTERS } from "@/domain/categories";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** What to export: the categories and how to combine them, the year, a role, the columns, the order, the format. */
export const personExportSchema = z.object({
  categorie: z
    .array(z.string())
    .transform((l) => [...new Set(l.filter((k) => categoryDef(k)))].slice(0, 20))
    .refine((l) => l.length > 0, "Alegeți cel puțin o categorie."),
  mod: z.enum(["oricare", "toate"]).catch("oricare"),
  an: z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)), z.number().int().min(1800).max(2200).optional()),
  functie: z.string().optional().transform((v) => (v && ID.test(v) ? v : "")),
  coloane: z
    .array(z.string())
    .transform((l) => EXPORT_COLUMN_KEYS.filter((c) => l.includes(c)) as ExportColumn[])
    .refine((l) => l.length > 0, "Alegeți cel puțin o coloană."),
  ordine: z.enum(EXPORT_SORTS).catch("alfabetic"),
  format: z.enum(EXPORT_FORMATS).catch("xlsx"),
  // GENDER-AGE-FILTERS: the list's filters (anything else = everybody).
  gen: z.enum(GENDER_FILTERS).catch("toti"),
  varsta: z.enum(AGE_FILTERS).catch("toti"),
});
export type PersonExportInput = z.output<typeof personExportSchema>;

export function personExportInput(source: FormData | URLSearchParams) {
  return {
    categorie: source.getAll("categorie").map(String),
    mod: source.get("mod") ?? undefined,
    an: source.get("an") ?? undefined,
    functie: source.get("functie") ?? undefined,
    coloane: source.getAll("coloane").map(String),
    ordine: source.get("ordine") ?? undefined,
    format: source.get("format") ?? undefined,
    gen: source.get("gen") ?? undefined,
    varsta: source.get("varsta") ?? undefined,
  };
}
