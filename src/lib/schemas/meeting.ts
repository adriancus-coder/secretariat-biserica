import { z } from "zod";
import { DEFAULT_CLOSING, MAX_POINTS, minutesFromRich, POINT_MAX } from "../minutes";
import type { RichDoc } from "../rich-text";
import { checkRich, richField } from "./rich-text";
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
  "formatare",
] as const;

/** The points' rich documents: a JSON array in the hidden field `puncteRich`, one document per point. */
const richPointsField = z
  .string()
  .optional()
  .transform((s, ctx): RichDoc[] | null => {
    if (!s?.trim()) return null;
    let list: unknown;
    try {
      list = JSON.parse(s);
    } catch {
      list = null;
    }
    if (!Array.isArray(list)) {
      ctx.addIssue({ code: "custom", message: "Lista de puncte este invalidă." });
      return z.NEVER;
    }
    if (list.length > MAX_POINTS) {
      ctx.addIssue({ code: "custom", message: `Cel mult ${MAX_POINTS} de puncte.` });
      return z.NEVER;
    }
    const docs: RichDoc[] = [];
    for (const [i, value] of list.entries()) {
      const r = checkRich(value);
      if (!r.ok) {
        ctx.addIssue({ code: "custom", message: `Punctul ${i + 1}: ${r.message}` });
        return z.NEVER;
      }
      docs.push(r.doc);
    }
    return docs;
  });

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

export const meetingSchema = z
  .object({
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
    // The editor's documents; when sent, the plain fields above become their projection.
    puncteRich: richPointsField,
    observatiiRich: richField,
    formulaRich: richField,
  })
  .transform((m, ctx) => {
    const out = { ...m, ...minutesFromRich(m) };
    if (out.puncte.some((p) => p.length > POINT_MAX)) ctx.addIssue({ code: "custom", path: ["puncte"], message: `Un punct poate avea cel mult ${POINT_MAX} de caractere.` });
    if (out.observatii.length > 20000) ctx.addIssue({ code: "custom", path: ["observatii"], message: "Observațiile pot avea cel mult 20000 de caractere." });
    if (out.formulaIncheiere.length > 300) ctx.addIssue({ code: "custom", path: ["formulaIncheiere"], message: "Formula de încheiere poate avea cel mult 300 de caractere." });
    return out;
  });

export type MeetingInput = z.output<typeof meetingSchema>;

/** Datele formularului: câmpurile simple + lista de prezenți (valori multiple). */
export function meetingFormInput(formData: FormData) {
  return { ...Object.fromEntries(formData), prezenti: formData.getAll("prezenti").map(String) };
}
