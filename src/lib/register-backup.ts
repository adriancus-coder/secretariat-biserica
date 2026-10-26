/**
 * Register fields of the Statut (art. 14, 20–24) in the JSON backup, on each member:
 * `dataCasatoriei`, `numeTata`, `numeMama`, `dataCerereRetragere`, `plecatDin`, `plecatUnde`, and the
 * minutes of the entry / exclusion as meeting ids of the file (`intrarePv`, `iesirePv`). Written only
 * when set; files without them import unchanged.
 */
import { isIsoDate } from "./dates";

export interface RegisterFields {
  dataCasatoriei: string | null;
  necasatorit: boolean;
  numeTata: string;
  numeMama: string;
  dataCerereRetragere: string | null;
  plecatDin: string | null;
  plecatUnde: string;
  intrarePv: string | null;
  iesirePv: string | null;
}

const KEYS = ["dataCasatoriei", "necasatorit", "numeTata", "numeMama", "dataCerereRetragere", "plecatDin", "plecatUnde", "intrarePv", "iesirePv"] as const;
const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 160) : "");
const date = (v: unknown) => (typeof v === "string" && isIsoDate(v.trim()) ? v.trim() : null);
const id = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);

/** Adds the fields that are set to the exported members (in place). */
export function addMemberRegister(members: Record<string, Record<string, unknown>>, register: ReadonlyMap<string, RegisterFields>) {
  for (const [memberId, r] of register) {
    const m = members[memberId];
    if (!m) continue;
    for (const k of KEYS) if (r[k]) m[k] = r[k];
  }
}

/** Member id (as in the file) → its register fields, for members that carry at least one. */
export function parseMemberRegister(root: unknown): Map<string, RegisterFields> {
  const out = new Map<string, RegisterFields>();
  const members = typeof root === "object" && root !== null ? (root as Record<string, unknown>).members : null;
  if (typeof members !== "object" || members === null) return out;
  const list: [string, unknown][] = Array.isArray(members)
    ? members.map((m, i) => [String((m as { id?: unknown })?.id ?? i), m])
    : Object.entries(members);
  for (const [key, m] of list) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    if (!KEYS.some((k) => k in r)) continue;
    out.set(String(r.id ?? key), {
      dataCasatoriei: date(r.dataCasatoriei),
      // Never together with a date.
      necasatorit: r.necasatorit === true && !date(r.dataCasatoriei),
      numeTata: str(r.numeTata),
      numeMama: str(r.numeMama),
      dataCerereRetragere: date(r.dataCerereRetragere),
      plecatDin: date(r.plecatDin),
      plecatUnde: str(r.plecatUnde),
      intrarePv: id(r.intrarePv),
      iesirePv: id(r.iesirePv),
    });
  }
  return out;
}
