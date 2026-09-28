import { z } from "zod";
import { ROLES } from "../labels";
import { optionalEmail, requiredEnum, requiredText, text } from "../validation";
import { emailField } from "./auth";

export const NOMEN_MAX_ITEMS = 60;
export const NOMEN_MAX_LENGTH = 80;

/** O valoare pe linie: fără spații la capete, fără linii goale sau dubluri. */
export const nomenLines = z
  .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
  .transform((s) => [...new Set(s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))])
  .refine((l) => l.length <= NOMEN_MAX_ITEMS, `Cel mult ${NOMEN_MAX_ITEMS} de valori.`)
  .refine((l) => l.every((x) => x.length <= NOMEN_MAX_LENGTH), `Fiecare valoare poate avea cel mult ${NOMEN_MAX_LENGTH} de caractere.`);

export const SETTINGS_FIELDS = [
  "nume",
  "adresa",
  "orgNr",
  "telefon",
  "email",
  "pastor",
  "secretar",
  "tipuriSedinte",
  "tipuriEvenimente",
  "tipuriMentiuni",
  "gradeRudenie",
] as const;

export const churchSettingsSchema = z.object({
  nume: requiredText(160, "Numele bisericii este obligatoriu.", "Numele"),
  adresa: text(300, "Adresa"),
  orgNr: text(60, "Org.nr."),
  telefon: text(60, "Telefonul"),
  email: optionalEmail,
  pastor: text(120, "Numele pastorului"),
  secretar: text(120, "Numele secretarului"),
  tipuriSedinte: nomenLines,
  tipuriEvenimente: nomenLines,
  tipuriMentiuni: nomenLines,
  gradeRudenie: nomenLines,
});

export const inviteSchema = z.object({
  email: emailField,
  role: requiredEnum(ROLES, "Alegeți rolul."),
});
