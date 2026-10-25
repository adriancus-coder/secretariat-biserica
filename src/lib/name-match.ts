/** Matching names written in documents ("Ioana Pop", "POP Ioana") to persons in the register. Pure. */
import { normalizeSearch } from "./text";

export interface NamedPerson {
  id: string;
  nume: string;
  prenume: string;
  /** Persons who left the register (false) are matched only by their exact name. Default true. */
  active?: boolean;
}

/** How a unique match was found: the exact name, or every written word among the person's words. */
export type MatchHow = "exact" | "partial";

export type NameMatch = { status: "unique"; id: string; how: MatchHow } | { status: "ambiguous"; ids: string[] } | { status: "none" };

/** Words without diacritics, lower-case; hyphens split words ("Vasile-Pop" = "Vasile Pop"). */
const words = (s: string) => normalizeSearch(s).split(/[\s-]+/).filter(Boolean);

/** The normalized form of a name: words without diacritics, lower-case, sorted ("pop vasile"). */
export function nameKey(name: string): string {
  return words(name).sort().join(" ");
}

/**
 * Diacritic- and case-insensitive, in any word order. In this order:
 * 1. exact: the words of the name are exactly the person's first name and surname;
 * 2. partial: every word of the name is among the words of an active person ("Adrian Cușniriuc" →
 *    "Cușniriuc Adrian Emanuel"); needs at least two words, so a first name alone is never matched
 *    automatically. One person → unique; several → ambiguous with those persons as candidates.
 */
export function matchPersonName(name: string, persons: readonly NamedPerson[]): NameMatch {
  const wanted = words(name);
  if (!wanted.length) return { status: "none" };
  const key = [...wanted].sort().join(" ");
  const exact = persons.filter((p) => nameKey(`${p.prenume} ${p.nume}`) === key).map((p) => p.id);
  if (exact.length === 1) return { status: "unique", id: exact[0], how: "exact" };
  if (exact.length) return { status: "ambiguous", ids: exact };
  const partial = persons
    .filter((p) => p.active !== false)
    .filter((p) => {
      const own = words(`${p.prenume} ${p.nume}`);
      return wanted.every((w) => own.includes(w));
    })
    .map((p) => p.id);
  if (partial.length === 1 && wanted.length >= 2) return { status: "unique", id: partial[0], how: "partial" };
  return partial.length ? { status: "ambiguous", ids: partial } : { status: "none" };
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
