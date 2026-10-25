import { z } from "zod";
import { isIsoDate } from "../dates";

/**
 * What the AI extraction returns, per document kind. The JSON schemas are sent to the model as
 * structured output; the zod schemas check the answer again and reject anything off-schema.
 */

export const EXTRACT_MAX_BYTES = 20 * 1024 * 1024;
export const EXTRACT_MEDIA_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type ExtractMediaType = (typeof EXTRACT_MEDIA_TYPES)[number];

const isoOrNull = z.string().refine(isIsoDate, "Dată invalidă.").nullable();
const textOrNull = z.string().max(300).nullable();

/** A transfer certificate or a membership application → a person. */
export const personDraftSchema = z
  .object({
    nume: textOrNull,
    prenume: textOrNull,
    gen: z.enum(["M", "F"]).nullable(),
    dataNasterii: isoOrNull,
    dataBotez: isoOrNull,
    botezBiserica: textOrNull,
    botezLocalitate: textOrNull,
    botezOficiant: textOrNull,
    bisericaProvenienta: textOrNull,
    telefon: textOrNull,
    email: textOrNull,
    adresa: textOrNull,
    kind: z.enum(["TRANSFER", "BOTEZ"]).nullable(),
  })
  .strict();
export type PersonDraft = z.output<typeof personDraftSchema>;

/** Minutes → the same draft the Word import produces. */
export const minutesDraftSchema = z
  .object({
    nr: z.number().int().min(1).max(9999).nullable(),
    data: isoOrNull,
    tip: textOrNull,
    prezenti: z.array(z.string().max(120)).max(500),
    absenti: z.array(z.string().max(120)).max(500),
    invitati: z.array(z.string().max(120)).max(100),
    puncte: z.array(z.string().max(2000)).max(100),
    formulaIncheiere: textOrNull,
    secretar: textOrNull,
    pastor: textOrNull,
  })
  .strict();
export type MinutesDraft = z.output<typeof minutesDraftSchema>;

const str = { type: ["string", "null"] } as const;
const date = { type: ["string", "null"], description: "AAAA-LL-ZZ sau null" } as const;
const names = { type: "array", items: { type: "string" } } as const;

export const personDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nume", "prenume", "gen", "dataNasterii", "dataBotez", "botezBiserica", "botezLocalitate", "botezOficiant", "bisericaProvenienta", "telefon", "email", "adresa", "kind"],
  properties: {
    nume: { ...str, description: "Numele de familie" },
    prenume: str,
    gen: { type: ["string", "null"], enum: ["M", "F", null] },
    dataNasterii: date,
    dataBotez: date,
    botezBiserica: { ...str, description: "Biserica în care a fost botezată persoana; null dacă nu scrie" },
    botezLocalitate: { ...str, description: "Localitatea botezului; null dacă nu scrie" },
    botezOficiant: { ...str, description: "Cine a oficiat botezul (pastorul); null dacă nu scrie" },
    bisericaProvenienta: { ...str, description: "Biserica din care vine persoana (la transfer)" },
    telefon: str,
    email: str,
    adresa: str,
    kind: { type: ["string", "null"], enum: ["TRANSFER", "BOTEZ", null], description: "TRANSFER pentru certificat de transfer, BOTEZ pentru cerere de botez" },
  },
} as const;

export const minutesDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nr", "data", "tip", "prezenti", "absenti", "invitati", "puncte", "formulaIncheiere", "secretar", "pastor"],
  properties: {
    nr: { type: ["integer", "null"], description: "Numărul procesului-verbal" },
    data: date,
    tip: { ...str, description: "Tipul ședinței, de exemplu comitet sau adunare generală" },
    prezenti: { ...names, description: "Numele celor prezenți, așa cum sunt scrise" },
    absenti: names,
    invitati: names,
    puncte: { ...names, description: "Punctele discutate și aprobate, în ordine, fără numerotare" },
    formulaIncheiere: str,
    secretar: str,
    pastor: str,
  },
} as const;
