import { z } from "zod";
import { DEFAULT_CLOSING, MAX_POINTS, POINT_MAX } from "../minutes";
import { idSchema, longText, optionalInt, optionalTime, requiredDate, requiredText, text } from "../validation";

export const MEETING_FIELDS = [
  "nr",
  "titlu",
  "tip",
  "data",
  "ora",
  "loc",
  "presedinte",
  "prezenti",
  "absenti",
  "invitati",
  "ordine",
  "puncte",
  "observatii",
  "formulaIncheiere",
] as const;

/** The points editor sends its list as JSON in the hidden field `puncte`. */
const pointsField = z
  .preprocess(
    (v) => {
      if (v === null || v === undefined || v === "") return [];
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    },
    z.array(z.string(), { error: "Lista de puncte este invalidă." }).max(MAX_POINTS, `Cel mult ${MAX_POINTS} de puncte.`),
  )
  .transform((list) => list.map((p) => p.replace(/\r\n/g, "\n").trim()).filter(Boolean))
  .refine((list) => list.every((p) => p.length <= POINT_MAX), `Un punct poate avea cel mult ${POINT_MAX} de caractere.`);

export const meetingSchema = z.object({
  nr: optionalInt(1, 9999),
  titlu: text(200, "Titlul"),
  tip: requiredText(80, "Alegeți tipul ședinței."),
  data: requiredDate("Data este obligatorie."),
  ora: optionalTime,
  loc: text(160, "Locul"),
  presedinte: text(120, "Președintele de ședință"),
  prezenti: z.array(idSchema).max(5000),
  invitati: text(1000, "Invitații"),
  ordine: longText(20000, "Ordinea de zi"),
  puncte: pointsField,
  observatii: longText(20000, "Observațiile"),
  formulaIncheiere: text(300, "Formula de încheiere").transform((s) => s || DEFAULT_CLOSING),
});

export type MeetingInput = z.output<typeof meetingSchema>;

/** Datele formularului: câmpurile simple + lista de prezenți (valori multiple). */
export function meetingFormInput(formData: FormData) {
  return { ...Object.fromEntries(formData), prezenti: formData.getAll("prezenti").map(String) };
}
