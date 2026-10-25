import { z } from "zod";
import { DISCIPLINARY_FORMS, DISCIPLINARY_FORUMS, DISCIPLINARY_STATES } from "../labels";
import { longText, optionalDate, optionalEnum, optionalId, optionalTime, requiredEnum, text } from "../validation";

/** Fields tracked by the audit log (entity DISCIPLINE, administrators only). */
export const DISCIPLINE_FIELDS = [
  "forma",
  "stare",
  "dataInceput",
  "dataSfarsit",
  "procesVerbal",
  "motivMasura",
  "forul",
  "audiere",
  "abatere",
  "raspuns",
  "nuSaPrezentat",
  "incadrare",
  "temei",
  "comunicatLa",
  "contestatieLa",
  "contestatieRezultat",
  "cerereRepunereLa",
  "repunere",
] as const;

export const APPEAL_RESULTS = ["ADMISA", "RESPINSA"] as const;
export const APPEAL_RESULT_LABEL = { ADMISA: "admisă", RESPINSA: "respinsă" } as const;

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
    // Hearing (art. 272 lit. a), the disciplinary minutes (lit. c), communication and appeal (art. 27 alin. 10–11).
    audiereLa: optionalDate,
    audiereOra: optionalTime,
    audiereLoc: text(200, "Locul audierii"),
    abatere: longText(4000, "Abaterea constatată"),
    raspuns: longText(4000, "Răspunsul persoanei"),
    nuSaPrezentat: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    incadrare: text(300, "Încadrarea statutară"),
    temei: text(300, "Temeiul statutar"),
    comunicatLa: optionalDate,
    contestatieLa: optionalDate,
    contestatieRezultat: optionalEnum(APPEAL_RESULTS),
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

/**
 * Closing an investigation (Statut art. 272 lit. c): the committee's minutes and the mandatory contents
 * of the disciplinary minutes. Returns field errors (empty = complete).
 */
export function closingErrors(v: Pick<DisciplineInput, "meetingId" | "abatere" | "raspuns" | "nuSaPrezentat" | "incadrare" | "temei">): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.meetingId) e.meetingId = "Încheierea cercetării se consemnează în procesul-verbal al ședinței de comitet (Statut art. 272 lit. c).";
  if (!v.abatere.trim()) e.abatere = "Completați abaterea constatată (art. 272 lit. c).";
  if (!v.raspuns.trim() && !v.nuSaPrezentat) e.raspuns = "Completați răspunsul persoanei sau bifați „Nu s-a prezentat” (art. 272 lit. c).";
  if (!v.incadrare.trim()) e.incadrare = "Completați încadrarea statutară (art. 272 lit. c).";
  if (!v.temei.trim()) e.temei = "Completați temeiul statutar (art. 272 lit. c).";
  return e;
}

/** Reinstatement (Statut art. 271): the written request's date and the committee minutes. */
export const reinstateSchema = z.object({
  cerereLa: optionalDate.refine((v) => v !== null, "Completați data cererii scrise (Statut art. 271 alin. 1 lit. e)."),
  meetingId: optionalId.refine((v) => v !== null, "Alegeți procesul-verbal al comitetului (Statut art. 271 alin. 2)."),
});
