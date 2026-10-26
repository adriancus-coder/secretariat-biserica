/** "Necăsătorit(ă)": the flag next to the marriage date (see Person.necasatorit). Pure. */
import { ageAt } from "./dates";

/** The label in the gender's form; the neutral "Necăsătorit(ă)" when the gender is missing. */
export function unmarriedLabel(gen: string | null | undefined): string {
  return gen === "M" ? "Necăsătorit" : gen === "F" ? "Necăsătorită" : "Necăsătorit(ă)";
}

/** Under 18 on `today` by the birth date; no birth date = not a minor (as everywhere else). */
export function isMinorByBirth(dataNasterii: string | null | undefined, today: string): boolean {
  return Boolean(dataNasterii) && ageAt(dataNasterii!, today) < 18;
}

export const UNMARRIED_AND_DATE_ERROR = "Alegeți fie data căsătoriei, fie „Necăsătorit(ă)”, nu ambele.";

/**
 * The rule: with the flag set there is no marriage date, and a minor is never flagged (treated as
 * unmarried without saving anything).
 */
export function normalizeUnmarried(v: { necasatorit: boolean; dataCasatoriei: string | null; dataNasterii: string | null }, today: string): boolean {
  return v.necasatorit && !v.dataCasatoriei && !isMinorByBirth(v.dataNasterii, today);
}
