/** Attendance rules per meeting type, absentees and quorum. Pure. */

export const ATTENDANCE_RULES = ["TOTI", "COMITET", "MANUAL"] as const;
export type AttendanceRule = (typeof ATTENDANCE_RULES)[number];

export const ATTENDANCE_RULE_LABEL: Record<AttendanceRule, string> = {
  TOTI: "Toți membrii",
  COMITET: "Comitetul",
  MANUAL: "Manual",
};

/** Rules for the default meeting types; any other type is "Manual" until the church sets a rule. */
export const DEFAULT_ATTENDANCE_RULES: Readonly<Record<string, AttendanceRule>> = {
  "Adunare generală": "TOTI",
  Comitet: "COMITET",
  "Frați slujitori": "COMITET",
};

const isRule = (v: unknown): v is AttendanceRule => typeof v === "string" && (ATTENDANCE_RULES as readonly string[]).includes(v);

/** The saved rules (Church.regulaPrezenta), keeping only valid entries. */
export function parseAttendanceRules(saved: unknown): Record<string, AttendanceRule> {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter((e): e is [string, AttendanceRule] => isRule(e[1])));
}

export function attendanceRule(tip: string, saved: Readonly<Record<string, AttendanceRule>>): AttendanceRule {
  return saved[tip] ?? DEFAULT_ATTENDANCE_RULES[tip] ?? "MANUAL";
}

/** The rule of every meeting type in the nomenclature. */
export function resolveAttendanceRules(tipuri: readonly string[], saved: unknown): Record<string, AttendanceRule> {
  const rules = parseAttendanceRules(saved);
  return Object.fromEntries(tipuri.map((t) => [t, attendanceRule(t, rules)]));
}

/** "Adunare generală: Toți membrii; Comitet: Comitetul": the comparable audit view (manual types omitted). */
export function attendanceRulesText(rules: Readonly<Record<string, AttendanceRule>>): string {
  return Object.entries(rules)
    .filter(([, r]) => r !== "MANUAL")
    .map(([t, r]) => `${t}: ${ATTENDANCE_RULE_LABEL[r]}`)
    .join("; ");
}

/** Expected persons who are not present. */
export function absentees(expected: readonly string[], present: readonly string[]): string[] {
  const here = new Set(present);
  return [...new Set(expected)].filter((id) => !here.has(id));
}

/**
 * ATTENDANCE-COUNT: a meeting's attendance is recorded by name (the ticks, MeetingAttendee) or only as a
 * number (`Meeting.numarPrezenti`; then no names and no absentees).
 */
export const ATTENDANCE_MODES = ["nume", "numar"] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];
export const ATTENDANCE_MODE_LABEL: Record<AttendanceMode, string> = { nume: "Pe nume", numar: "Doar numărul" };
export const COUNT_MODE_COMMITTEE_HINT = "La «Doar numărul», absențele membrilor comitetului nu se mai urmăresc pentru această ședință (art. 45).";
export const PERSONAL_HISTORY_NOTE = "Ședințele consemnate doar ca număr nu apar aici.";

export const attendanceMode = (numarPrezenti: number | null | undefined): AttendanceMode => (numarPrezenti == null ? "nume" : "numar");

/**
 * The count field when the mode changes: to „Doar numărul” it starts at the persons ticked; back to
 * „Pe nume” it is cleared.
 */
export function countOnModeChange(next: AttendanceMode, ticked: number): string {
  return next === "numar" ? String(ticked) : "";
}

/** How many were present: the number when recorded as one, else the persons ticked. */
export function presentCount(m: { numarPrezenti: number | null | undefined; present: number }): number {
  return m.numarPrezenti ?? m.present;
}

/** The absentees shown: none when the attendance is only a number. */
export function shownAbsentees<T>(numarPrezenti: number | null | undefined, absent: readonly T[]): T[] {
  return numarPrezenti == null ? [...absent] : [];
}

/** „Mai mulți decât cei așteptați (N). Verificați.” — a warning only (guests may come too). */
export function countAboveExpected(count: number | null, expected: number | null): string | null {
  return count !== null && expected !== null && expected > 0 && count > expected ? `Mai mulți decât cei așteptați (${expected}). Verificați.` : null;
}

/**
 * The votes of a point never exceed those present: for + against + abstentions ≤ presentCount. Checked
 * when the attendance is known (a number, or at least one person ticked). Returns the error or null.
 */
export function votesOverPresent(votes: readonly ({ pentru: number; contra: number; abtineri: number } | null)[] | null, present: number, known: boolean): string | null {
  if (!votes || !known) return null;
  for (const [i, v] of votes.entries()) {
    if (!v) continue;
    const total = v.pentru + v.contra + v.abtineri;
    if (total > present) return `Punctul ${i + 1}: ${total} voturi, mai multe decât prezenții (${present}).`;
  }
  return null;
}

/**
 * "Prezenți 12 din 15 (80 %)": of the `expected` persons (stored when the meeting was saved), those
 * present (presentCount; by name, the expected ones not absent). Null when nothing was expected.
 */
export function quorumLine(expected: number | null, present: number): string | null {
  if (!expected) return null;
  const p = Math.max(0, present);
  return `Prezenți ${p} din ${expected} (${Math.round((p / expected) * 100)} %)`;
}

/** "(3) Ana Pop, Ion Pop": attendance as count and names, for the audit log. */
export function attendanceText(names: readonly string[]): string {
  return names.length ? `(${names.length}) ${names.join(", ")}` : "";
}
