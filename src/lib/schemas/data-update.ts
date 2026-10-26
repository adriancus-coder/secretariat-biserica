import { z } from "zod";
import { todayIso } from "../dates";
import { GENDERS, OPTIONAL_CONSENTS, type OptionalConsentKey } from "../labels";
import { normalizeUnmarried, UNMARRIED_AND_DATE_ERROR } from "../marital";
import type { PrayerAnswer } from "../prayer";
import { idSchema, optionalDate, optionalEmail, optionalEnum, optionalPastYear, postalCode, requiredText, text } from "../validation";

/**
 * A data-update submission: the person's own fields and their minor children's (only these; never
 * notes, roles, groups, status, discipline or other relatives), the notice confirmation and the four
 * optional consents for each. Stored as `DataUpdateSubmission.proposed`.
 */
export const SELF_FIELDS = [
  "nume",
  "prenume",
  "gen",
  "dataNasterii",
  "dataCasatoriei",
  "telefon",
  "email",
  "adresa",
  "codPostal",
  "localitate",
  "dataBotez",
  "botezAn",
  "botezBiserica",
  "botezLocalitate",
  "botezOficiant",
  "numeTata",
  "numeMama",
] as const;
export type SelfField = (typeof SELF_FIELDS)[number];
export const CHILD_FIELDS = ["nume", "prenume", "gen", "dataNasterii", "dataBinecuvantare"] as const;
export type ChildField = (typeof CHILD_FIELDS)[number];

export const SELF_LABEL: Record<SelfField, string> = {
  nume: "Nume",
  prenume: "Prenume",
  gen: "Gen",
  dataNasterii: "Data nașterii",
  dataCasatoriei: "Data căsătoriei",
  telefon: "Telefon",
  email: "E-mail",
  adresa: "Adresă",
  codPostal: "Cod poștal",
  localitate: "Localitate",
  dataBotez: "Data botezului",
  botezAn: "Anul botezului",
  botezBiserica: "Biserica botezului",
  botezLocalitate: "Localitatea botezului",
  botezOficiant: "Oficiat de",
  numeTata: "Numele tatălui",
  numeMama: "Numele mamei",
};
export const CHILD_LABEL: Record<ChildField, string> = {
  nume: "Nume",
  prenume: "Prenume",
  gen: "Gen",
  dataNasterii: "Data nașterii",
  dataBinecuvantare: "Binecuvântare",
};

const notFuture = (d: string | null) => d === null || d <= todayIso();

const answer = z.preprocess((v) => (v === "da" ? true : v === "nu" ? false : v), z.boolean({ error: "Alegeți Da sau Nu." }));
export const consentsSchema = z.object(Object.fromEntries(OPTIONAL_CONSENTS.map((k) => [k, answer])) as Record<OptionalConsentKey, typeof answer>);
export type ConsentAnswers = Record<OptionalConsentKey, boolean>;

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const selfFields = z.object({
  nume: requiredText(100, "Numele este obligatoriu.", "Numele"),
  prenume: text(100, "Prenumele"),
  gen: optionalEnum(GENDERS),
  dataNasterii: optionalDate.refine(notFuture, "Data nașterii nu poate fi în viitor."),
  dataCasatoriei: optionalDate.refine(notFuture, "Data căsătoriei nu poate fi în viitor."),
  necasatorit: checkbox,
  telefon: text(50, "Telefonul"),
  email: optionalEmail,
  adresa: text(200, "Adresa"),
  codPostal: postalCode,
  localitate: text(100, "Localitatea"),
  dataBotez: optionalDate.refine(notFuture, "Data botezului nu poate fi în viitor."),
  botezAn: optionalPastYear,
  botezBiserica: text(160, "Biserica botezului"),
  botezLocalitate: text(160, "Localitatea botezului"),
  botezOficiant: text(160, "Numele celui care a oficiat botezul"),
  numeTata: text(160, "Numele tatălui"),
  numeMama: text(160, "Numele mamei"),
});
/** "Necăsătorit(ă)" excludes the marriage date; a minor (by the birth date given) is never flagged. */
export const selfSchema = selfFields
  .superRefine((v, ctx) => {
    if (v.necasatorit && v.dataCasatoriei) ctx.addIssue({ code: "custom", path: ["necasatorit"], message: UNMARRIED_AND_DATE_ERROR });
  })
  .transform((v) => ({ ...v, necasatorit: normalizeUnmarried(v, todayIso()) }));
export type SelfData = z.output<typeof selfSchema>;

export const childSchema = z.object({
  /** An existing child of the register (personal link); absent for a child added in the form. */
  id: idSchema.nullable().optional(),
  nume: requiredText(100, "Numele copilului este obligatoriu.", "Numele"),
  prenume: text(100, "Prenumele"),
  gen: optionalEnum(GENDERS),
  dataNasterii: optionalDate.refine(notFuture, "Data nașterii nu poate fi în viitor."),
  dataBinecuvantare: optionalDate.refine(notFuture, "Data binecuvântării nu poate fi în viitor."),
  consents: consentsSchema,
});
export type ChildData = z.output<typeof childSchema>;

export interface DataUpdateProposal {
  self: SelfData;
  children: ChildData[];
  consents: ConsentAnswers;
  /** The privacy notice was read (required). */
  nota: true;
  /** General link only: what the person typed at the identity step (for the secretary's match). */
  typed?: { nume: string; telefon: string };
  /** The notice version published when the answer was sent (the consents' textVersion); older answers have none. */
  versiuneNota?: string;
  /**
   * The weekly prayer (personal link, the head / a spouse / an adult without a family): both boxes
   * unticked by default. Absent when the section was not shown.
   */
  prayer?: PrayerAnswer;
  /** Set at approval: the prayer answers the secretariat applied (the other parent's decision uses them). */
  prayerApplied?: Partial<PrayerAnswer>;
}

/** The form's fields → the proposal, with field errors (children as `copii.<i>.<field>`). */
export function parseProposal(form: Record<string, unknown>): { ok: true; value: DataUpdateProposal } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const self = selfSchema.safeParse({ ...Object.fromEntries(SELF_FIELDS.map((k) => [k, form[k] ?? ""])), necasatorit: form.necasatorit });
  if (!self.success) for (const i of self.error.issues) errors[String(i.path[0])] ??= i.message;
  const consents = consentsSchema.safeParse(Object.fromEntries(OPTIONAL_CONSENTS.map((k) => [k, form[`acord_${k}`]])));
  if (!consents.success) for (const i of consents.error.issues) errors[`acord_${String(i.path[0])}`] ??= "Alegeți Da sau Nu.";
  if (form.nota !== "on" && form.nota !== "true") errors.nota = "Confirmați că ați citit nota de informare.";
  let rawChildren: unknown = [];
  try {
    rawChildren = JSON.parse(String(form.copii ?? "[]"));
  } catch {
    errors.copii = "Datele copiilor nu au putut fi citite.";
  }
  const children: ChildData[] = [];
  if (!Array.isArray(rawChildren) || rawChildren.length > 15) errors.copii ??= "Cel mult 15 copii.";
  else
    rawChildren.forEach((c, i) => {
      const r = childSchema.safeParse(c);
      if (r.success) children.push(r.data);
      else for (const issue of r.error.issues) errors[`copii.${i}.${issue.path.join(".")}`] ??= issue.path[0] === "consents" ? "Alegeți Da sau Nu." : issue.message;
    });
  if (Object.keys(errors).length || !self.success || !consents.success) return { ok: false, errors };
  // The prayer section sends "rugaciuneSectiune" when shown; an unticked box is a "no".
  const prayer = form.rugaciuneSectiune === "1" ? { optOut: form.rugaciuneNepomenita === "on", includeChildren: form.rugaciuneCopii === "on" } : undefined;
  return { ok: true, value: { self: self.data, children, consents: consents.data, nota: true, ...(prayer ? { prayer } : {}) } };
}
