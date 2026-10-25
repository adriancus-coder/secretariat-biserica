import { z } from "zod";
import { DOCUMENT_TYPES } from "../labels";
import { richToPlain } from "../rich-text";
import { idSchema, longText, optionalInt, requiredDate, requiredEnum, text } from "../validation";
import { richField } from "./rich-text";

export const DOCUMENT_FIELDS = ["tip", "nr", "data", "persoana", "catre", "scop", "titlu", "text", "formatare", "anRaport"] as const;

const optionalId = z.preprocess((v) => (v === null || v === undefined || v === "" ? null : v), idSchema.nullable());

export const documentSchema = z
  .object({
    tip: requiredEnum(DOCUMENT_TYPES, "Alegeți tipul documentului."),
    /** Gol = numerotare automată (următorul număr liber din anul documentului). */
    nr: optionalInt(1, 999999),
    data: requiredDate("Data este obligatorie."),
    personId: optionalId,
    catre: text(300, "Destinatarul"),
    scop: text(300, "Scopul"),
    titlu: text(300, "Titlul"),
    text: longText(100000, "Conținutul"),
    /** The editor's document; when sent, `text` becomes its plain projection. */
    textRich: richField,
    anRaport: optionalInt(1800, 2200),
    /** Recommendation during an investigation, for a move (Statut art. 27 alin. 6); administrators only. */
    exceptieDomiciliu: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .transform((d, ctx) => {
    const text = d.textRich ? richToPlain(d.textRich) : d.text;
    if (!text.trim()) ctx.addIssue({ code: "custom", path: ["text"], message: "Conținutul lipsește." });
    else if (text.length > 100000) ctx.addIssue({ code: "custom", path: ["text"], message: "Conținutul poate avea cel mult 100000 de caractere." });
    return { ...d, text };
  });

export type DocumentInput = z.output<typeof documentSchema>;

/** Parametrii pentru generarea textului din șablon. */
export const draftSchema = z.object({
  tip: requiredEnum(DOCUMENT_TYPES),
  personId: optionalId,
  catre: text(300),
  scop: text(300),
  anRaport: optionalInt(1800, 2200),
  data: requiredDate(),
  /** Dare de seamă: append the 5-year evolution table (outside the prototype's text). */
  evolutie: z.boolean().optional(),
  exceptieDomiciliu: z.boolean().optional(),
});

export type DraftInput = z.output<typeof draftSchema>;
