import { z } from "zod";
import { DOCUMENT_TYPES } from "../labels";
import { idSchema, longText, optionalInt, requiredDate, requiredEnum, text } from "../validation";

export const DOCUMENT_FIELDS = ["tip", "nr", "data", "persoana", "catre", "scop", "titlu", "text", "anRaport"] as const;

const optionalId = z.preprocess((v) => (v === null || v === undefined || v === "" ? null : v), idSchema.nullable());

export const documentSchema = z.object({
  tip: requiredEnum(DOCUMENT_TYPES, "Alegeți tipul documentului."),
  /** Gol = numerotare automată (următorul număr liber din anul documentului). */
  nr: optionalInt(1, 999999),
  data: requiredDate("Data este obligatorie."),
  personId: optionalId,
  catre: text(300, "Destinatarul"),
  scop: text(300, "Scopul"),
  titlu: text(300, "Titlul"),
  text: longText(100000, "Conținutul").pipe(z.string().min(1, "Conținutul lipsește.")),
  anRaport: optionalInt(1800, 2200),
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
});

export type DraftInput = z.output<typeof draftSchema>;
