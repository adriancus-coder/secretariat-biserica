import { addressFromInput } from "./address";
import { FAMILY_NAME_MAX } from "./families";

/**
 * Families in the JSON backup: a `families` collection and `familyId` on each member, next to the
 * prototype's text `familie` (kept, with the family's display name, for older readers). Files without
 * `families` are migrated on import: one family per family text, head chosen by pickHead.
 */
export interface BFamily {
  id: string;
  nume: string;
  /** Member id (as in the file) of the head, or null. */
  capId: string | null;
  adresa: string;
  codPostal: string;
  localitate: string;
  note: string;
  /** Created automatically and never edited (see Family.autoCreated); false in older files. */
  automata: boolean;
}

export function familiesToJson(list: BFamily[]): Record<string, BFamily> {
  return Object.fromEntries(list.map((f) => [f.id, f]));
}

/** Adds `familyId` to the exported members (in place). */
export function addMemberFamilies(members: Record<string, Record<string, unknown>>, familyOf: ReadonlyMap<string, string>) {
  for (const [id, familyId] of familyOf) if (members[id]) members[id].familyId = familyId;
}

export interface ParsedFamilies {
  /** null when the file has no `families` collection. */
  families: BFamily[] | null;
  /** Member id (as in the file) → family id (as in the file), for members whose family exists in the file. */
  memberFamily: Map<string, string>;
  errors: string[];
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function entries(c: unknown): [string, Record<string, unknown>][] {
  if (c === undefined || c === null || typeof c !== "object") return [];
  const list: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  return list.filter((e): e is [string, Record<string, unknown>] => typeof e[1] === "object" && e[1] !== null);
}

export function parseFamiliesJson(root: unknown): ParsedFamilies {
  const out: ParsedFamilies = { families: null, memberFamily: new Map(), errors: [] };
  if (typeof root !== "object" || root === null) return out;
  const r = root as Record<string, unknown>;
  if (r.families === undefined || r.families === null) return out;
  out.families = [];
  const ids = new Set<string>();
  for (const [key, f] of entries(r.families)) {
    const id = String(f.id ?? key).trim();
    if (!ID_RE.test(id)) {
      out.errors.push(`Familia „${key.slice(0, 40)}”: identificator invalid.`);
      continue;
    }
    const nume = str(f.nume, FAMILY_NAME_MAX);
    if (!nume) {
      out.errors.push(`Familia ${id}: numele lipsește.`);
      continue;
    }
    const capId = typeof f.capId === "string" && ID_RE.test(f.capId) ? f.capId : null;
    ids.add(id);
    out.families.push({ id, nume, capId, ...addressFromInput({ adresa: str(f.adresa, 200), codPostal: str(f.codPostal, 10), localitate: str(f.localitate, 100) }), note: str(f.note, 2000), automata: f.automata === true });
  }
  for (const [key, m] of entries(r.members)) {
    const familyId = typeof m.familyId === "string" ? m.familyId : null;
    if (familyId && ids.has(familyId)) out.memberFamily.set(String(m.id ?? key).trim(), familyId);
  }
  return out;
}
