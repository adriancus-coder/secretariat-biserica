import { z } from "zod";
import { longText, optionalInt, optionalTime, requiredDate, requiredText, text } from "../validation";

export const EVENT_FIELDS = [
  "titlu",
  "tip",
  "data",
  "ora",
  "loc",
  "invitat",
  "responsabil",
  "descriere",
  "agapaActiva",
  "agapaResponsabil",
  "agapaPersoane",
  "contributii",
] as const;

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
  descriere: longText(20000, "Descrierea"),
  agapaActiva: z.boolean(),
  agapaResponsabil: text(160, "Responsabilul agapei"),
  agapaPersoane: optionalInt(0, 100000),
  contributii: z.array(contribution).max(300),
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
  return { ...fields, agapaActiva: formData.get("agapaActiva") === "on", contributii };
}
