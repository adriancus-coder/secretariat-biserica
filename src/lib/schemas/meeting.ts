import { z } from "zod";
import { idSchema, longText, optionalTime, requiredDate, requiredText, text } from "../validation";

export const MEETING_FIELDS = [
  "titlu",
  "tip",
  "data",
  "ora",
  "loc",
  "presedinte",
  "prezenti",
  "invitati",
  "ordine",
  "discutii",
  "hotarari",
] as const;

export const meetingSchema = z.object({
  titlu: text(200, "Titlul"),
  tip: requiredText(80, "Alegeți tipul ședinței."),
  data: requiredDate("Data este obligatorie."),
  ora: optionalTime,
  loc: text(160, "Locul"),
  presedinte: text(120, "Președintele de ședință"),
  prezenti: z.array(idSchema).max(5000),
  invitati: text(1000, "Invitații"),
  ordine: longText(20000, "Ordinea de zi"),
  discutii: longText(50000, "Discuțiile"),
  hotarari: longText(20000, "Hotărârile"),
});

export type MeetingInput = z.output<typeof meetingSchema>;

/** Datele formularului: câmpurile simple + lista de prezenți (valori multiple). */
export function meetingFormInput(formData: FormData) {
  return { ...Object.fromEntries(formData), prezenti: formData.getAll("prezenti").map(String) };
}
