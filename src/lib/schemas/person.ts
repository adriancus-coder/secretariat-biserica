import { z } from "zod";
import { todayIso } from "../dates";
import { ENTRY_MODES, EXIT_MODES, GENDERS, PERSON_STATUSES } from "../labels";
import { NEW_FAMILY } from "../families";
import { baptismYearOf, idSchema, optionalId, longText, optionalDate, optionalPastYear, optionalEmail, optionalEnum, requiredEnum, requiredText, text } from "../validation";

export const PERSON_FIELDS = [
  "nume",
  "prenume",
  "statut",
  "gen",
  "rudenie",
  "dataNasterii",
  "telefon",
  "email",
  "adresa",
  "dataMembru",
  "modIntrare",
  "bisericaProvenienta",
  "dataBotez",
  "botezAn",
  "botezBiserica",
  "botezLocalitate",
  "botezOficiant",
  "dataBinecuvantare",
  "dataIesire",
  "modIesire",
  "bisericaDestinatie",
  "dataCerereRetragere",
  "dataCasatoriei",
  "numeTata",
  "numeMama",
  "plecatDin",
  "plecatUnde",
  "note",
  "inComitet",
] as const;

const personFields = z.object({
  nume: requiredText(100, "Numele este obligatoriu.", "Numele"),
  prenume: text(100, "Prenumele"),
  statut: requiredEnum(PERSON_STATUSES, "Alegeți statutul."),
  gen: optionalEnum(GENDERS),
  familyId: text(64, "Familia").refine((s) => s === "" || s === NEW_FAMILY || idSchema.safeParse(s).success, "Alegeți familia din listă."),
  rudenie: text(60, "Gradul de rudenie"),
  dataNasterii: optionalDate,
  telefon: text(50, "Telefonul"),
  email: optionalEmail,
  adresa: text(200, "Adresa"),
  dataMembru: optionalDate,
  modIntrare: optionalEnum(ENTRY_MODES),
  bisericaProvenienta: text(160, "Biserica de proveniență"),
  dataBotez: optionalDate,
  botezAn: optionalPastYear,
  botezBiserica: text(160, "Biserica botezului"),
  botezLocalitate: text(160, "Localitatea botezului"),
  botezOficiant: text(160, "Numele celui care a oficiat botezul"),
  dataBinecuvantare: optionalDate,
  dataIesire: optionalDate,
  modIesire: optionalEnum(EXIT_MODES),
  bisericaDestinatie: text(160, "Biserica de destinație"),
  dataCerereRetragere: optionalDate,
  intrareMeetingId: optionalId,
  iesireMeetingId: optionalId,
  dataCasatoriei: optionalDate,
  numeTata: text(160, "Numele tatălui"),
  numeMama: text(160, "Numele mamei"),
  plecatDin: optionalDate,
  plecatUnde: text(160, "Locul"),
  note: longText(5000, "Notele"),
  inComitet: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

/** Validarea completă, inclusiv verificările de consistență a datelor (raportate împreună cu celelalte erori). */
export const personSchema = personFields
  .superRefine((v, ctx) => {
    for (const [path, message] of Object.entries(personDateErrors(v, todayIso()))) {
      ctx.addIssue({ code: "custom", path: [path], message });
    }
  })
  // A full baptism date also fills the year; the year alone leaves the date empty.
  .transform((v) => ({ ...v, botezAn: baptismYearOf(v.dataBotez, v.botezAn) }));

export type PersonInput = z.output<typeof personFields>;

/**
 * Regula din prototip (saveMember): dacă s-a completat data ieșirii și modul nu este „Deces”,
 * statutul devine automat „Fost membru”.
 */
export function applyExitRule(input: PersonInput): PersonInput {
  if (input.dataIesire && input.statut !== "FOST_MEMBRU" && input.modIesire !== "DECES") {
    return { ...input, statut: "FOST_MEMBRU" };
  }
  return input;
}

/** Verificări de consistență care depind de data curentă. */
export function personDateErrors(input: PersonInput, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.dataNasterii && input.dataNasterii > today) errors.dataNasterii = "Data nașterii nu poate fi în viitor.";
  if (input.dataNasterii && input.dataIesire && input.dataIesire < input.dataNasterii) {
    errors.dataIesire = "Data ieșirii este înaintea datei nașterii.";
  }
  // Statut art. 24: the exit's own conditions.
  if (input.modIesire === "RETRAGERE" && !input.dataCerereRetragere) {
    errors.dataCerereRetragere = "Retragerea se face pe baza unei cereri scrise (Statut art. 24 alin. 2). Completați data cererii.";
  }
  if (input.modIesire === "EXCLUDERE" && !input.iesireMeetingId) {
    errors.iesireMeetingId = "Excluderea se consemnează într-un proces-verbal. Alegeți procesul-verbal.";
  }
  if (input.modIesire === "TRANSFER" && !input.bisericaDestinatie.trim()) {
    errors.bisericaDestinatie = "Completați biserica de destinație.";
  }
  if (input.plecatDin && input.plecatDin > today) errors.plecatDin = "Data plecării nu poate fi în viitor.";
  if (input.dataCasatoriei && input.dataCasatoriei > today) errors.dataCasatoriei = "Data căsătoriei nu poate fi în viitor.";
  // Statut art. 28: aparținătorii sunt nebotezați.
  if (input.statut === "APARTINATOR" && (input.dataBotez || input.botezAn)) {
    errors.statut = "Aparținătorii sunt persoane nebotezate (Statut art. 28). Alegeți „Membru” sau „Botezat, fără calitate de membru”.";
  }
  return errors;
}
