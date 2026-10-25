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
 * "Prezenți 12 din 15 (80 %)": of the `expected` persons (stored when the meeting was saved),
 * those not absent. Null when nothing was expected (manual types, meetings saved before the rules).
 */
export function quorumLine(expected: number | null, absent: number): string | null {
  if (!expected) return null;
  const present = Math.max(0, expected - absent);
  return `Prezenți ${present} din ${expected} (${Math.round((present / expected) * 100)} %)`;
}

/** "(3) Ana Pop, Ion Pop": attendance as count and names, for the audit log. */
export function attendanceText(names: readonly string[]): string {
  return names.length ? `(${names.length}) ${names.join(", ")}` : "";
}
