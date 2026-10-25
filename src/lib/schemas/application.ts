import { z } from "zod";
import { todayIso } from "../dates";
import { APPLICATION_KINDS, GENDERS } from "../labels";
import { baptismYearOf, longText, optionalDate, optionalPastYear, optionalEmail, optionalEnum, requiredEnum, requiredText, text } from "../validation";

export const APPLICATION_MESSAGE_MAX = 2000;

export const APPLICATIONS_CLOSED_MESSAGE = "Această biserică nu primește cereri online în acest moment.";

/** Fields tracked by the audit log for applications. */
export const APPLICATION_FIELDS = ["stare", "tipCerere", "nume", "prenume", "telefon", "email", "motiv"] as const;

const applicationFields = z.object({
  kind: requiredEnum(APPLICATION_KINDS, "Alegeți tipul cererii."),
  nume: requiredText(100, "Numele este obligatoriu.", "Numele"),
  prenume: requiredText(100, "Prenumele este obligatoriu.", "Prenumele"),
  gen: optionalEnum(GENDERS),
  dataNasterii: optionalDate,
  telefon: text(50, "Telefonul"),
  email: optionalEmail,
  adresa: text(200, "Adresa"),
  familie: text(100, "Familia"),
  rudenie: text(60, "Gradul de rudenie"),
  bisericaProvenienta: text(160, "Biserica de proveniență"),
  dataBotez: optionalDate,
  botezAn: optionalPastYear,
  botezBiserica: text(160, "Biserica botezului"),
  botezLocalitate: text(160, "Localitatea botezului"),
  botezOficiant: text(160, "Numele celui care a oficiat botezul"),
  mesaj: longText(APPLICATION_MESSAGE_MAX, "Mesajul"),
  // Checked against the statutes the church published (in the action).
  consentStatutCult: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  consentStatutIntern: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  consent: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.boolean().refine((v) => v, "Este necesar acordul pentru păstrarea datelor."),
  ),
});

/** The public form /cerere/<slug>. Transfer details are kept only for transfers. */
export const applicationSchema = applicationFields
  .superRefine((v, ctx) => {
    const today = todayIso();
    if (!v.telefon && !v.email) {
      ctx.addIssue({ code: "custom", path: ["telefon"], message: "Lăsați un telefon sau un e-mail, ca biserica să vă poată contacta." });
    }
    if (v.dataNasterii && v.dataNasterii > today) ctx.addIssue({ code: "custom", path: ["dataNasterii"], message: "Data nașterii nu poate fi în viitor." });
    if (hasBaptismFields(v.kind) && v.dataBotez) {
      if (v.dataBotez > today) ctx.addIssue({ code: "custom", path: ["dataBotez"], message: "Data botezului nu poate fi în viitor." });
      else if (v.dataNasterii && v.dataBotez < v.dataNasterii) {
        ctx.addIssue({ code: "custom", path: ["dataBotez"], message: "Data botezului este înaintea datei nașterii." });
      }
    }
  })
  .transform((v) => ({ ...v, botezAn: baptismYearOf(v.dataBotez, v.botezAn) }))
  .transform((v) =>
    v.kind === "TRANSFER"
      ? v
      : v.kind === "CERERE_MEMBRALITATE"
        ? { ...v, bisericaProvenienta: "" }
        : { ...v, bisericaProvenienta: "", dataBotez: null as string | null, botezAn: null as number | null, botezBiserica: "", botezLocalitate: "", botezOficiant: "" },
  );

/** Kinds whose applicant is already baptised: the form asks for the baptism details. */
export function hasBaptismFields(kind: string | null | undefined): boolean {
  return kind === "TRANSFER" || kind === "CERERE_MEMBRALITATE";
}

export type ApplicationInput = z.output<typeof applicationSchema>;
