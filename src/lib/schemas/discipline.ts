import { z } from "zod";
import { DISCIPLINARY_FORMS, DISCIPLINARY_FORUMS, DISCIPLINARY_STATES } from "../labels";
import { longText, optionalDate, optionalId, requiredEnum } from "../validation";

/** Fields tracked by the audit log (entity DISCIPLINE, administrators only). */
export const DISCIPLINE_FIELDS = ["forma", "stare", "dataInceput", "dataSfarsit", "procesVerbal", "motivMasura", "forul"] as const;

const requiredDate = (message: string) => optionalDate.refine((v) => v !== null, message);

/** A disciplinary measure (Statut art. 27): an exclusion and a closed measure need their minutes / end date. */
export const disciplineSchema = z
  .object({
    forma: requiredEnum(DISCIPLINARY_FORMS, "Alegeți forma măsurii."),
    stare: requiredEnum(DISCIPLINARY_STATES, "Alegeți starea."),
    dataInceput: requiredDate("Completați data."),
    dataSfarsit: optionalDate,
    meetingId: optionalId,
    motiv: longText(4000, "Motivul"),
    decisByForum: requiredEnum(DISCIPLINARY_FORUMS, "Alegeți forul."),
  })
  .superRefine((v, ctx) => {
    if (v.dataSfarsit && v.dataInceput && v.dataSfarsit < v.dataInceput) {
      ctx.addIssue({ code: "custom", path: ["dataSfarsit"], message: "Data încheierii este înaintea datei de început." });
    }
    if (v.forma === "EXCLUDERE" && v.stare === "APLICATA" && !v.meetingId) {
      ctx.addIssue({ code: "custom", path: ["meetingId"], message: "Excluderea se consemnează într-un proces-verbal (Statut art. 27 alin. 10)." });
    }
  });

export type DisciplineInput = z.output<typeof disciplineSchema>;
