import { z } from "zod";
import { optionalId, optionalInt, requiredDate, requiredText, text } from "../validation";

/** Fields tracked by the audit log (entity CORRESPONDENCE): names instead of ids. */
export const CORRESPONDENCE_FIELDS = ["nr", "data", "directie", "dela", "catre", "subiect", "rezolvare", "document", "raspunsLa", "persoana"] as const;

/** One entry or exit of the register (CORRESPONDENCE-REGISTER): metadata only, never the letter's text. */
export const correspondenceSchema = z
  .object({
    /** Empty = the next free number of the year. */
    nr: optionalInt(1, 999999),
    data: requiredDate(),
    directie: z.enum(["INTRARE", "IESIRE"], { message: "Alegeți intrare sau ieșire." }),
    dela: text(200, "Expeditorul"),
    catre: text(200, "Destinatarul"),
    subiect: requiredText(300, "Subiectul lipsește.", "Subiectul"),
    rezolvare: text(200, "Rezolvarea"),
    documentId: optionalId,
    raspunsLaId: optionalId,
    personId: optionalId,
  })
  .superRefine((x, ctx) => {
    if (x.directie === "INTRARE" && !x.dela) ctx.addIssue({ code: "custom", path: ["dela"], message: "Scrieți de la cine vine." });
    if (x.directie === "IESIRE" && !x.catre) ctx.addIssue({ code: "custom", path: ["catre"], message: "Scrieți către cine pleacă." });
  });
export type CorrespondenceInput = z.infer<typeof correspondenceSchema>;
