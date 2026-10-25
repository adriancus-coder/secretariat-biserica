/**
 * The committee (Statut art. 45). Pure.
 * - Mandate of 5 years from the election, extended once by 5 years; a second extension is refused.
 * - Reminded 6 months before it ends.
 * - Eligibility (alin. 4): at least 2 years a member of the church and 5 years in the Cult (counted from
 *   baptism), without an applied disciplinary measure. The measure is checked by administrators only.
 * - 5 consecutive unexcused absences from committee meetings are reported to the administrator.
 */
import { ageAt, monthsBefore } from "./dates";
import { fmtL } from "./format";

export const MANDATE_YEARS = 5;
export const ABSENCE_LIMIT = 5;
export const COMMITTEE_CHECK_HINT = "Verificați condițiile din Statut art. 45 alin. 4.";

/** "2026-03-15" + n years (29 February → 28 February). */
export function addYears(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4)) + n;
  const md = iso.slice(5) === "02-29" ? "02-28" : iso.slice(5);
  return `${y}-${md}`;
}

/** The mandate's last day: 5 years after the election, 10 when extended. */
export function mandateEnd(alesLa: string, prelungit: boolean): string {
  return addYears(alesLa, prelungit ? 2 * MANDATE_YEARS : MANDATE_YEARS);
}

export type MandateState = { state: "ok" | "soon" | "expired"; end: string };

/** "soon" from 6 months before the end, "expired" from the end. */
export function mandateState(today: string, alesLa: string, prelungit: boolean): MandateState {
  const end = mandateEnd(alesLa, prelungit);
  if (today >= end) return { state: "expired", end };
  return { state: monthsBefore(end, 6) <= today ? "soon" : "ok", end };
}

/** The Acasă line, or null while the mandate is far from its end. */
export function mandateNotice(today: string, alesLa: string | null, prelungit: boolean): string | null {
  if (!alesLa) return null;
  const s = mandateState(today, alesLa, prelungit);
  if (s.state === "ok") return null;
  return s.state === "expired"
    ? `Mandatul comitetului a expirat la ${fmtL(s.end)}${prelungit ? "" : " (poate fi prelungit o singură dată cu 5 ani)"} — Statut art. 45.`
    : `Mandatul comitetului expiră la ${fmtL(s.end)} — Statut art. 45.`;
}

/** The warnings shown when "Membru în comitet" is ticked (dates only; discipline is added for administrators). */
export function eligibilityWarnings(p: { dataMembru: string | null; dataBotez: string | null; botezAn: number | null }, today: string): string[] {
  const out: string[] = [];
  if (!p.dataMembru) out.push("Data intrării ca membru nu este completată (Statut art. 45 alin. 4: cel puțin 2 ani membru al bisericii).");
  else if (ageAt(p.dataMembru, today) < 2) out.push("Este membru al bisericii de mai puțin de 2 ani (Statut art. 45 alin. 4).");
  const baptized = p.dataBotez ? ageAt(p.dataBotez, today) : p.botezAn ? Number(today.slice(0, 4)) - p.botezAn : null;
  if (baptized === null) out.push("Data botezului nu este completată (Statut art. 45 alin. 4: cel puțin 5 ani în Cult).");
  else if (baptized < 5) out.push("Este în Cult (de la botez) de mai puțin de 5 ani (Statut art. 45 alin. 4).");
  return out;
}

/** Unexcused absences in a row, newest first, until the first presence or excused absence. */
export function consecutiveUnexcused(rows: readonly { status: "PRESENT" | "ABSENT"; motivat: boolean }[]): number {
  let n = 0;
  for (const r of rows) {
    if (r.status === "PRESENT" || r.motivat) break;
    n++;
  }
  return n;
}
