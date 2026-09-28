import { z } from "zod";
import { todayIso } from "../dates";
import { ENTRY_MODES, EXIT_MODES, GENDERS, PERSON_STATUSES } from "../labels";
import { longText, optionalDate, optionalEmail, optionalEnum, requiredEnum, requiredText, text } from "../validation";

export const PERSON_FIELDS = [
  "nume",
  "prenume",
  "statut",
  "gen",
  "familie",
  "rudenie",
  "dataNasterii",
  "telefon",
  "email",
  "adresa",
  "dataMembru",
  "modIntrare",
  "bisericaProvenienta",
  "dataBotez",
  "locBotez",
  "dataBinecuvantare",
  "dataIesire",
  "modIesire",
  "bisericaDestinatie",
  "slujire",
  "note",
] as const;

const personFields = z.object({
  nume: requiredText(100, "Numele este obligatoriu.", "Numele"),
  prenume: text(100, "Prenumele"),
  statut: requiredEnum(PERSON_STATUSES, "Alegeți statutul."),
  gen: optionalEnum(GENDERS),
  familie: text(100, "Familia"),
  rudenie: text(60, "Gradul de rudenie"),
  dataNasterii: optionalDate,
  telefon: text(50, "Telefonul"),
  email: optionalEmail,
  adresa: text(200, "Adresa"),
  dataMembru: optionalDate,
  modIntrare: optionalEnum(ENTRY_MODES),
  bisericaProvenienta: text(160, "Biserica de proveniență"),
  dataBotez: optionalDate,
  locBotez: text(160, "Locul botezului"),
  dataBinecuvantare: optionalDate,
  dataIesire: optionalDate,
  modIesire: optionalEnum(EXIT_MODES),
  bisericaDestinatie: text(160, "Biserica de destinație"),
  slujire: text(300, "Slujirea"),
  note: longText(5000, "Notele"),
});

/** Validarea completă, inclusiv verificările de consistență a datelor (raportate împreună cu celelalte erori). */
export const personSchema = personFields.superRefine((v, ctx) => {
  for (const [path, message] of Object.entries(personDateErrors(v, todayIso()))) {
    ctx.addIssue({ code: "custom", path: [path], message });
  }
});

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
  return errors;
}
