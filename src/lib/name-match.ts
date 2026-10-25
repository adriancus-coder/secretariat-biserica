/** Matching names written in documents ("Ioana Pop", "POP Ioana") to persons in the register. Pure. */
import { normalizeSearch } from "./text";

export interface NamedPerson {
  id: string;
  nume: string;
  prenume: string;
}

export type NameMatch = { status: "unique"; id: string } | { status: "ambiguous"; ids: string[] } | { status: "none" };

const tokens = (s: string) => normalizeSearch(s).split(/[\s-]+/).filter(Boolean).sort();

/**
 * Diacritic- and case-insensitive, in either order ("Prenume Nume" or "Nume Prenume"): the words of
 * the name must be exactly the words of the person's first name and surname.
 */
export function matchPersonName(name: string, persons: readonly NamedPerson[]): NameMatch {
  const wanted = tokens(name).join(" ");
  if (!wanted) return { status: "none" };
  const ids = persons.filter((p) => tokens(`${p.prenume} ${p.nume}`).join(" ") === wanted).map((p) => p.id);
  if (ids.length === 1) return { status: "unique", id: ids[0] };
  return ids.length ? { status: "ambiguous", ids } : { status: "none" };
}

/** The meeting type in the church's list closest to the written one ("de comitet" → "Comitet"); else `fallback`. */
export function matchMeetingType(written: string | null, types: readonly string[], fallback: string): string {
  const w = normalizeSearch(written ?? "");
  if (!w) return fallback;
  const exact = types.find((t) => normalizeSearch(t) === w);
  if (exact) return exact;
  const contained = types.find((t) => w.includes(normalizeSearch(t)) || normalizeSearch(t).includes(w));
  return contained ?? fallback;
}
