import { storedVotes, type Vote } from "./general-assembly";
import { MAX_POINTS, minutesFromRich, POINT_MAX } from "./minutes";
import type { RichDoc } from "./rich-text";
import { storedRich } from "./schemas/rich-text";

/**
 * Meeting fields beyond the prototype's JSON, on each meeting next to `prezenti`, `discutii` and
 * `hotarari`: `absenti` (person ids), `asteptati` (how many the attendance rule expected), `nr`,
 * `puncte`, `observatii` and `formulaIncheiere`, and their rich versions `puncteRich`, `observatiiRich`,
 * `formulaRich`, and the General Assembly's `convocatLa`, `convocareText`, `tipAG`,
 * `convocataDeComunitate` with the votes per point `voturi`. Files without them import unchanged (the points then
 * come from `hotarari` / `discutii`, see splitDecisions).
 */

import { storedLayout, type PageLayout } from "./page-layout";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface MeetingExtra {
  absenti: string[];
  asteptati: number | null;
  /** ATTENDANCE-COUNT: the attendance recorded only as a number (no names then); absent = by name. */
  numarPrezenti?: number;
  nr?: number | null;
  puncte?: string[];
  observatii?: string;
  formulaIncheiere?: string;
  /** The editor's documents (src/lib/rich-text.ts): one per point, the observations, the closing sentence. */
  puncteRich?: RichDoc[];
  observatiiRich?: RichDoc;
  formulaRich?: RichDoc;
  /**
   * Signatures of persons present: PNG as base64, signing time as ISO. MINUTES-SIGNATURES: `peHartie`
   * marks one signed on paper (no image, `semnatLa` = when it was marked).
   */
  semnaturi?: { persoanaId: string; imagine: string; semnatLa: string; peHartie?: true }[];
  /** The Secretar / Pastor signatures at the bottom (MINUTES-SIGNATURES): the name signed, drawn or on paper. */
  semnaturiRol?: { rol: "SECRETAR" | "PASTOR"; nume: string; imagine: string; semnatLa: string; peHartie?: true }[];
  /** Closed (read-only) minutes, with the closing time as ISO. */
  inchisLa?: string | null;
  /** The meeting's own page layout (src/lib/page-layout.ts); absent = the church's default. */
  asezare?: PageLayout;
  /** General Assembly (Statut art. 46): the announcement date (ISO), its text, the kind, convened by the Comunitate. */
  convocatLa?: string;
  convocareText?: string;
  tipAG?: "ORDINARA" | "EXTRAORDINARA";
  convocataDeComunitate?: boolean;
  /** Votes per point, aligned with `puncte` (null = no vote). */
  voturi?: (Vote | null)[];
  /** Excused absences (person ids among `absenti`, Statut art. 45). */
  motivati?: string[];
}

/** The committee's mandate (Statut art. 45), top-level `comitet`: election date, the election's minutes (meeting id), extended once. */
export interface BCommittee {
  alesLa: string | null;
  sedinta: string | null;
  prelungit: boolean;
}

export function committeeToJson(c: { comitetAlesLa: string | null; comitetAlegereMeetingId: string | null; comitetPrelungit: boolean }): BCommittee | undefined {
  if (!c.comitetAlesLa && !c.comitetAlegereMeetingId && !c.comitetPrelungit) return undefined;
  return { alesLa: c.comitetAlesLa, sedinta: c.comitetAlegereMeetingId, prelungit: c.comitetPrelungit };
}

export function parseCommitteeJson(root: unknown): BCommittee | null {
  const c = typeof root === "object" && root !== null ? (root as Record<string, unknown>).comitet : undefined;
  if (typeof c !== "object" || c === null) return null;
  const x = c as Record<string, unknown>;
  const alesLa = typeof x.alesLa === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.alesLa) && !Number.isNaN(Date.parse(x.alesLa)) ? x.alesLa : null;
  const sedinta = typeof x.sedinta === "string" && ID_RE.test(x.sedinta) ? x.sedinta : null;
  return { alesLa, sedinta, prelungit: alesLa !== null && x.prelungit === true };
}

/** Adds the extra fields to the exported meetings (in place). */
export function addMeetingExtras(meetings: Record<string, Record<string, unknown>>, extra: ReadonlyMap<string, MeetingExtra>) {
  for (const [id, x] of extra) {
    const m = meetings[id];
    if (!m) continue;
    if (x.absenti.length) m.absenti = x.absenti;
    if (x.asteptati !== null) m.asteptati = x.asteptati;
    if (x.numarPrezenti !== undefined) m.numarPrezenti = x.numarPrezenti;
    if (x.nr != null) m.nr = x.nr;
    if (x.puncte) m.puncte = x.puncte;
    if (x.observatii !== undefined) m.observatii = x.observatii;
    if (x.formulaIncheiere !== undefined) m.formulaIncheiere = x.formulaIncheiere;
    if (x.puncteRich) m.puncteRich = x.puncteRich;
    if (x.observatiiRich) m.observatiiRich = x.observatiiRich;
    if (x.formulaRich) m.formulaRich = x.formulaRich;
    if (x.semnaturi?.length) m.semnaturi = x.semnaturi;
    if (x.semnaturiRol?.length) m.semnaturiRol = x.semnaturiRol;
    if (x.asezare) m.asezare = x.asezare;
    if (x.inchisLa) m.inchisLa = x.inchisLa;
    if (x.convocatLa) m.convocatLa = x.convocatLa;
    if (x.convocareText) m.convocareText = x.convocareText;
    if (x.tipAG) m.tipAG = x.tipAG;
    if (x.convocataDeComunitate) m.convocataDeComunitate = true;
    if (x.voturi) m.voturi = x.voturi;
    if (x.motivati?.length) m.motivati = x.motivati;
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
    const numar = int(m.numarPrezenti, 100_000);
    if (numar !== null) x.numarPrezenti = numar;
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
    // Rich text: only documents that pass the editor's schema; they then decide the plain text
    // (a file whose rich and plain texts disagree keeps the rich one, as the app would show it).
    const richPoints = Array.isArray(m.puncteRich) && m.puncteRich.length <= MAX_POINTS ? m.puncteRich.map(storedRich) : null;
    const rich = minutesFromRich({
      puncteRich: richPoints && richPoints.every(Boolean) ? (richPoints as RichDoc[]) : null,
      observatiiRich: storedRich(m.observatiiRich),
      formulaRich: storedRich(m.formulaRich),
    });
    if (rich.puncte && rich.puncte.every((p) => p.length <= POINT_MAX)) {
      x.puncte = rich.puncte;
      if (rich.puncteRich) x.puncteRich = rich.puncteRich;
    }
    if (rich.observatii !== undefined && rich.observatii.length <= 20000) {
      x.observatii = rich.observatii;
      if (rich.observatiiRich) x.observatiiRich = rich.observatiiRich;
    }
    if (rich.formulaIncheiere !== undefined && rich.formulaIncheiere.length <= 300) {
      x.formulaIncheiere = rich.formulaIncheiere;
      if (rich.formulaRich) x.formulaRich = rich.formulaRich;
    }
    if (Array.isArray(m.semnaturi)) {
      const list = m.semnaturi
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({ persoanaId: s.persoanaId, imagine: s.peHartie === true ? "" : s.imagine, semnatLa: s.semnatLa, ...(s.peHartie === true ? { peHartie: true as const } : {}) }))
        .filter(
          (s): s is { persoanaId: string; imagine: string; semnatLa: string; peHartie?: true } =>
            typeof s.persoanaId === "string" &&
            ID_RE.test(s.persoanaId) &&
            typeof s.imagine === "string" &&
            s.imagine.length <= 200_000 &&
            typeof s.semnatLa === "string" &&
            !Number.isNaN(Date.parse(s.semnatLa)),
        );
      if (list.length) x.semnaturi = list;
    }
    if (Array.isArray(m.semnaturiRol)) {
      const seen = new Set<string>();
      const list = m.semnaturiRol
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({ rol: s.rol, nume: str(s.nume, 200), imagine: s.peHartie === true ? "" : s.imagine, semnatLa: s.semnatLa, ...(s.peHartie === true ? { peHartie: true as const } : {}) }))
        .filter(
          (s): s is { rol: "SECRETAR" | "PASTOR"; nume: string; imagine: string; semnatLa: string; peHartie?: true } =>
            (s.rol === "SECRETAR" || s.rol === "PASTOR") &&
            !seen.has(s.rol) &&
            Boolean(seen.add(s.rol)) &&
            typeof s.imagine === "string" &&
            s.imagine.length <= 200_000 &&
            (s.peHartie === true || s.imagine.length > 0) &&
            typeof s.semnatLa === "string" &&
            !Number.isNaN(Date.parse(s.semnatLa)),
        );
      if (list.length) x.semnaturiRol = list;
    }
    if (typeof m.inchisLa === "string" && !Number.isNaN(Date.parse(m.inchisLa))) x.inchisLa = m.inchisLa;
    if (typeof m.asezare === "object" && m.asezare !== null) x.asezare = storedLayout(m.asezare);
    if (typeof m.convocatLa === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.convocatLa) && !Number.isNaN(Date.parse(m.convocatLa))) x.convocatLa = m.convocatLa;
    const convocare = str(m.convocareText, 2000);
    if (convocare) x.convocareText = convocare;
    if (m.tipAG === "ORDINARA" || m.tipAG === "EXTRAORDINARA") x.tipAG = m.tipAG;
    if (m.convocataDeComunitate === true) x.convocataDeComunitate = true;
    if (Array.isArray(m.motivati)) {
      const excused = [...new Set(m.motivati.filter((v): v is string => typeof v === "string" && x.absenti.includes(v)))];
      if (excused.length) x.motivati = excused;
    }
    const votes = storedVotes(m.voturi);
    if (votes) x.voturi = votes;
    if (
      x.absenti.length ||
      x.asteptati !== null ||
      x.numarPrezenti !== undefined ||
      x.nr ||
      x.puncte ||
      x.observatii !== undefined ||
      x.formulaIncheiere ||
      x.semnaturi ||
      x.semnaturiRol ||
      x.inchisLa ||
      x.asezare ||
      x.convocatLa ||
      x.convocareText ||
      x.tipAG ||
      x.convocataDeComunitate ||
      x.voturi
    ) {
      out.set(String(m.id ?? key).trim(), x);
    }
  }
  return out;
}
