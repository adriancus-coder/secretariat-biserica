import { z } from "zod";
import { ATTENDANCE_RULES, type AttendanceRule } from "../attendance";
import { ROLES } from "../labels";
import { isValidSlug, SLUG_MAX, SLUG_MIN } from "../slug";
import { longText, optionalEmail, requiredEnum, requiredText, text } from "../validation";
import { emailField } from "./auth";

export const NOMEN_MAX_ITEMS = 60;
export const NOMEN_MAX_LENGTH = 80;

/** O valoare pe linie: fără spații la capete, fără linii goale sau dubluri. */
export const nomenLines = z
  .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
  .transform((s) => [...new Set(s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))])
  .refine((l) => l.length <= NOMEN_MAX_ITEMS, `Cel mult ${NOMEN_MAX_ITEMS} de valori.`)
  .refine((l) => l.every((x) => x.length <= NOMEN_MAX_LENGTH), `Fiecare valoare poate avea cel mult ${NOMEN_MAX_LENGTH} de caractere.`);

/** Spaces become hyphens and letters lowercase; anything else must already be valid. */
const slugField = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, "-") : ""),
  z
    .string()
    .refine(
      isValidSlug,
      `Între ${SLUG_MIN} și ${SLUG_MAX} caractere: litere mici fără diacritice, cifre și cratimă (ex. maranata-stavanger).`,
    ),
);

/** A checkbox: present ("on") when ticked, absent otherwise. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const SETTINGS_FIELDS = [
  "nume",
  "adresa",
  "orgNr",
  "telefon",
  "email",
  "pastor",
  "secretar",
  "pastorEmail",
  "secretarEmail",
  "tipuriSedinte",
  "tipuriEvenimente",
  "tipuriMentiuni",
  "gradeRudenie",
  "slug",
  "applicationsOpen",
  "require2fa",
  "passkeyPolicy",
  "semnaturaUnica",
  "semnaturaUnicaTipuri",
  "privacyText",
  "comunitate",
  "regulaPrezenta",
  "tipuriAG",
  "tipuriCvorum",
] as const;

export const churchSettingsSchema = z.object({
  nume: requiredText(160, "Numele bisericii este obligatoriu.", "Numele"),
  adresa: text(300, "Adresa"),
  orgNr: text(60, "Org.nr."),
  telefon: text(60, "Telefonul"),
  comunitate: text(200, "Comunitatea"),
  email: optionalEmail,
  pastor: text(120, "Numele pastorului"),
  secretar: text(120, "Numele secretarului"),
  pastorEmail: optionalEmail,
  secretarEmail: optionalEmail,
  tipuriSedinte: nomenLines,
  tipuriEvenimente: nomenLines,
  tipuriMentiuni: nomenLines,
  gradeRudenie: nomenLines,
  slug: slugField,
  applicationsOpen: checkbox,
  require2fa: checkbox,
  passkeyPolicy: checkbox,
  semnaturaUnica: z.enum(["", "TOATE", "TIPURI"]).catch(""),
  privacyText: longText(20000, "Nota de confidențialitate"),
});

/**
 * The attendance rule selects of the settings form (`regula:<tip>`), kept for the given meeting
 * types only; a missing or invalid value means "Manual".
 */
export function attendanceRulesInput(formData: FormData, tipuri: readonly string[]): Record<string, AttendanceRule> {
  return Object.fromEntries(
    tipuri.map((t) => {
      const v = formData.get(`regula:${t}`);
      return [t, (ATTENDANCE_RULES as readonly unknown[]).includes(v) ? (v as AttendanceRule) : "MANUAL"];
    }),
  );
}

/** The meeting types ticked in the settings form under `<prefix>:<tip>` ("ag", "cvorum"). */
export function meetingTypeFlagsInput(formData: FormData, tipuri: readonly string[], prefix: "ag" | "cvorum"): string[] {
  return tipuri.filter((t) => formData.get(`${prefix}:${t}`) === "on");
}

/** The document types ticked under "Semnătura se desenează de fiecare dată" (`semnatura:<tip>`). */
export function freshSignatureTypesInput(formData: FormData, types: readonly string[]): string[] {
  return types.filter((t) => formData.get(`semnatura:${t}`) === "on");
}

export const inviteSchema = z.object({
  email: emailField,
  role: requiredEnum(ROLES, "Alegeți rolul."),
});
