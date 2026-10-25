/** Meeting minutes (procese-verbale): points, closing sentence, numbering. Pure. */
import { richFormatSummary, richToPlain, type RichDoc } from "./rich-text";

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

export interface MinutesRich {
  puncteRich: RichDoc[] | null;
  observatiiRich: RichDoc | null;
  formulaRich: RichDoc | null;
}

/**
 * The plain fields from the rich ones (the projection stored next to them): empty points are
 * dropped with their document, an empty observation or closing sentence keeps no document (the
 * closing sentence then falls back to the default). Fields without a rich version are left out.
 */
export function minutesFromRich(x: MinutesRich): Partial<{ puncte: string[]; observatii: string; formulaIncheiere: string }> & MinutesRich {
  const out: ReturnType<typeof minutesFromRich> = { puncteRich: null, observatiiRich: null, formulaRich: null };
  if (x.puncteRich) {
    const kept = x.puncteRich.map((doc) => ({ doc, text: richToPlain(doc).trim() })).filter((p) => p.text);
    out.puncte = kept.map((p) => p.text);
    out.puncteRich = kept.length ? kept.map((p) => p.doc) : null;
  }
  if (x.observatiiRich) {
    out.observatii = richToPlain(x.observatiiRich).trim();
    out.observatiiRich = out.observatii ? x.observatiiRich : null;
  }
  if (x.formulaRich) {
    const f = richToPlain(x.formulaRich).trim();
    out.formulaIncheiere = f || DEFAULT_CLOSING;
    out.formulaRich = f ? x.formulaRich : null;
  }
  return out;
}

/** "puncte: îngroșat, mare; observații: centru" — the formatting of the minutes, for the audit log. */
export function minutesFormatting(x: { puncteRich?: unknown; observatiiRich?: unknown; formulaRich?: unknown }): string {
  const points = Array.isArray(x.puncteRich) ? [...new Set((x.puncteRich as RichDoc[]).map(richFormatSummary).join(", ").split(", ").filter(Boolean))].join(", ") : "";
  return [
    points ? `puncte: ${points}` : "",
    richFormatSummary(x.observatiiRich as RichDoc | null) ? `observații: ${richFormatSummary(x.observatiiRich as RichDoc)}` : "",
    richFormatSummary(x.formulaRich as RichDoc | null) ? `încheiere: ${richFormatSummary(x.formulaRich as RichDoc)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}
