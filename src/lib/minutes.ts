/** Meeting minutes (procese-verbale): points, closing sentence, numbering. Pure. */

export const DEFAULT_CLOSING = "Toate punctele au fost votate în unanimitate de membrii prezenți.";
export const MAX_POINTS = 100;
export const POINT_MAX = 2000;

/** A numbered line: "1. …", "2) …" (up to 3 digits, then a space or the end of the line). */
const NUMBERED = /^\s*\d{1,3}\s*[.)](\s+|$)/;

/**
 * Turns the old free texts into points and observations, without losing text:
 * - when Hotărâri has numbered lines, each starts a point, the lines after it continue it, and the
 *   lines before the first number go to the observations;
 * - otherwise every non-empty line of Hotărâri is a point;
 * - Discuții goes to the observations, after "Discuții:".
 * The `minutes_numbering` migration applies the same rule in SQL.
 */
export function splitDecisions(hotarari: string, discutii: string): { puncte: string[]; observatii: string } {
  const lines = hotarari.split(/\r?\n/);
  const numbered = lines.some((l) => NUMBERED.test(l));
  const puncte: string[] = [];
  let rest = "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (NUMBERED.test(line)) puncte.push(line.replace(NUMBERED, "").trim());
    else if (numbered && puncte.length) puncte[puncte.length - 1] += `\n${t}`;
    else if (numbered) rest = rest ? `${rest}\n${t}` : t;
    else puncte.push(t);
  }
  const d = discutii.trim();
  const observatii = [rest, d ? `Discuții:\n${d}` : ""].filter(Boolean).join("\n\n");
  return { puncte: puncte.map((p) => p.trim()).filter(Boolean), observatii };
}

/** "1. …\n2. …": the points as one text (the prototype's `hotarari` field in exports). */
export function pointsText(puncte: readonly string[]): string {
  return puncte.map((p, i) => `${i + 1}. ${p}`).join("\n");
}

/** "PV nr. 16/2026", or null for a meeting without a number. */
export function minutesNumber(m: { nr: number | null; anRegistru: number | null }): string | null {
  return m.nr !== null && m.anRegistru !== null ? `PV nr. ${m.nr}/${m.anRegistru}` : null;
}
