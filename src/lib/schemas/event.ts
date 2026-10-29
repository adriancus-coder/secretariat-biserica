import { z } from "zod";
import { idSchema, longText, optionalId, optionalInt, optionalTime, requiredDate, requiredText, text } from "../validation";

export const EVENT_FIELDS = [
  "titlu",
  "tip",
  "data",
  "ora",
  "loc",
  "invitat",
  "responsabil",
  "oficiant",
  "descriere",
  "agapaActiva",
  "agapaResponsabil",
  "agapaPersoane",
  "contributii",
  "familie",
  "persoane",
] as const;

/** EVENT-PERSONS: the persons of the event, as JSON in the hidden field `persoane`. */
const eventPersonsField = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s?.trim()) return [];
    let list: unknown;
    try {
      list = JSON.parse(s);
    } catch {
      list = null;
    }
    const r = z
      .array(
        z.object({
          personId: idSchema.nullable(),
          numeLiber: z.string().trim().max(160).default(""),
          rol: z.enum(["COPIL", "BOTEZAT", "MIRE", "MIREASA", "DECEDAT"]),
        }),
      )
      .max(30)
      .safeParse(list);
    if (!r.success) {
      ctx.addIssue({ code: "custom", message: "Lista de persoane a evenimentului este invalidă." });
      return z.NEVER;
    }
    return r.data;
  });

const contribution = z.object({
  cine: text(160, "„Cine”"),
  ce: text(300, "„Ce aduce”"),
});

export const eventSchema = z.object({
  titlu: requiredText(200, "Titlul și data sunt obligatorii.", "Titlul"),
  tip: requiredText(80, "Alegeți tipul evenimentului."),
  data: requiredDate("Titlul și data sunt obligatorii."),
  ora: optionalTime,
  loc: text(160, "Locul"),
  invitat: text(200, "Invitatul"),
  responsabil: text(160, "Responsabilul"),
  oficiant: text(160, "Oficiantul"),
  descriere: longText(20000, "Descrierea"),
  agapaActiva: z.boolean(),
  agapaResponsabil: text(160, "Responsabilul agapei"),
  agapaPersoane: optionalInt(0, 100000),
  contributii: z.array(contribution).max(300),
  familyId: optionalId,
  persoane: eventPersonsField,
});

export type EventInput = z.output<typeof eventSchema>;

/** Datele formularului: câmpurile simple, bifa pentru agapă și rândurile „cine aduce ce”. */
export function eventFormInput(formData: FormData) {
  const cine = formData.getAll("contrib_cine").map(String);
  const ce = formData.getAll("contrib_ce").map(String);
  const contributii = cine
    .map((c, i) => ({ cine: c.trim(), ce: (ce[i] ?? "").trim() }))
    // Ca în prototip: rândurile complet goale se ignoră.
    .filter((c) => c.cine || c.ce);
  const fields = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("contrib_")));
  // EVENT-FIELDS-BY-TYPE: without „Alt loc decât biserica” the event is at the church (the place is saved empty).
  const loc = formData.get("altLoc") === "on" ? String(formData.get("loc") ?? "") : "";
  return { ...fields, loc, agapaActiva: formData.get("agapaActiva") === "on", contributii };
}
