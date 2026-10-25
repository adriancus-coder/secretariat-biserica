/**
 * Attendance extras in the JSON backup, on each meeting next to the prototype's `prezenti`:
 * `absenti` (person ids) and `asteptati` (how many the attendance rule expected). Files without
 * them import unchanged.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface MeetingAttendanceExtra {
  absenti: string[];
  asteptati: number | null;
}

/** Adds `absenti` / `asteptati` to the exported meetings (in place). */
export function addMeetingAttendance(meetings: Record<string, Record<string, unknown>>, extra: ReadonlyMap<string, MeetingAttendanceExtra>) {
  for (const [id, x] of extra) {
    const m = meetings[id];
    if (!m) continue;
    if (x.absenti.length) m.absenti = x.absenti;
    if (x.asteptati !== null) m.asteptati = x.asteptati;
  }
}

/** Meeting id (as in the file) → absent person ids (as in the file) and expected count. */
export function parseMeetingAttendance(root: unknown): Map<string, MeetingAttendanceExtra> {
  const out = new Map<string, MeetingAttendanceExtra>();
  const c = typeof root === "object" && root !== null ? (root as Record<string, unknown>).meetings : undefined;
  if (!c || typeof c !== "object") return out;
  const entries: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  for (const [key, raw] of entries) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as { id?: unknown; absenti?: unknown; asteptati?: unknown };
    const absenti = Array.isArray(m.absenti) ? [...new Set(m.absenti.filter((x): x is string => typeof x === "string" && ID_RE.test(x)))] : [];
    const asteptati = typeof m.asteptati === "number" && Number.isInteger(m.asteptati) && m.asteptati >= 0 && m.asteptati <= 100_000 ? m.asteptati : null;
    if (absenti.length || asteptati !== null) out.set(String(m.id ?? key).trim(), { absenti, asteptati });
  }
  return out;
}
