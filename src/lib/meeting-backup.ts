import { MAX_POINTS, POINT_MAX } from "./minutes";

/**
 * Meeting fields beyond the prototype's JSON, on each meeting next to `prezenti`, `discutii` and
 * `hotarari`: `absenti` (person ids), `asteptati` (how many the attendance rule expected), `nr`,
 * `puncte`, `observatii` and `formulaIncheiere`. Files without them import unchanged (the points then
 * come from `hotarari` / `discutii`, see splitDecisions).
 */

import { storedLayout, type PageLayout } from "./page-layout";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface MeetingExtra {
  absenti: string[];
  asteptati: number | null;
  nr?: number | null;
  puncte?: string[];
  observatii?: string;
  formulaIncheiere?: string;
  /** Drawn signatures of persons present: PNG as base64, signing time as ISO. */
  semnaturi?: { persoanaId: string; imagine: string; semnatLa: string }[];
  /** Closed (read-only) minutes, with the closing time as ISO. */
  inchisLa?: string | null;
  /** The meeting's own page layout (src/lib/page-layout.ts); absent = the church's default. */
  asezare?: PageLayout;
}

/** Adds the extra fields to the exported meetings (in place). */
export function addMeetingExtras(meetings: Record<string, Record<string, unknown>>, extra: ReadonlyMap<string, MeetingExtra>) {
  for (const [id, x] of extra) {
    const m = meetings[id];
    if (!m) continue;
    if (x.absenti.length) m.absenti = x.absenti;
    if (x.asteptati !== null) m.asteptati = x.asteptati;
    if (x.nr != null) m.nr = x.nr;
    if (x.puncte) m.puncte = x.puncte;
    if (x.observatii !== undefined) m.observatii = x.observatii;
    if (x.formulaIncheiere !== undefined) m.formulaIncheiere = x.formulaIncheiere;
    if (x.semnaturi?.length) m.semnaturi = x.semnaturi;
    if (x.asezare) m.asezare = x.asezare;
    if (x.inchisLa) m.inchisLa = x.inchisLa;
  }
}

const int = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : undefined);

/** Meeting id (as in the file) → its extra fields (person ids as in the file). */
export function parseMeetingExtras(root: unknown): Map<string, MeetingExtra> {
  const out = new Map<string, MeetingExtra>();
  const c = typeof root === "object" && root !== null ? (root as Record<string, unknown>).meetings : undefined;
  if (!c || typeof c !== "object") return out;
  const entries: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  for (const [key, raw] of entries) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as Record<string, unknown>;
    const x: MeetingExtra = {
      absenti: Array.isArray(m.absenti) ? [...new Set(m.absenti.filter((v): v is string => typeof v === "string" && ID_RE.test(v)))] : [],
      asteptati: int(m.asteptati, 100_000),
    };
    const nr = int(m.nr, 9999);
    if (nr) x.nr = nr;
    if (Array.isArray(m.puncte)) {
      x.puncte = m.puncte
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.replace(/\r\n/g, "\n").trim().slice(0, POINT_MAX))
        .filter(Boolean)
        .slice(0, MAX_POINTS);
    }
    const obs = str(m.observatii, 20000);
    if (obs !== undefined) x.observatii = obs;
    const formula = str(m.formulaIncheiere, 300);
    if (formula) x.formulaIncheiere = formula;
    if (Array.isArray(m.semnaturi)) {
      const list = m.semnaturi
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({ persoanaId: s.persoanaId, imagine: s.imagine, semnatLa: s.semnatLa }))
        .filter(
          (s): s is { persoanaId: string; imagine: string; semnatLa: string } =>
            typeof s.persoanaId === "string" &&
            ID_RE.test(s.persoanaId) &&
            typeof s.imagine === "string" &&
            s.imagine.length <= 200_000 &&
            typeof s.semnatLa === "string" &&
            !Number.isNaN(Date.parse(s.semnatLa)),
        );
      if (list.length) x.semnaturi = list;
    }
    if (typeof m.inchisLa === "string" && !Number.isNaN(Date.parse(m.inchisLa))) x.inchisLa = m.inchisLa;
    if (typeof m.asezare === "object" && m.asezare !== null) x.asezare = storedLayout(m.asezare);
    if (x.absenti.length || x.asteptati !== null || x.nr || x.puncte || x.observatii !== undefined || x.formulaIncheiere || x.semnaturi || x.inchisLa || x.asezare) {
      out.set(String(m.id ?? key).trim(), x);
    }
  }
  return out;
}
