/**
 * The identity check of the data-update campaign: the full name and the phone number typed by the
 * person must both match the same person of the register. Pure. The caller never tells the person
 * which part failed.
 */
import { nameKey } from "./name-match";

const words = (s: string) => nameKey(s).split(" ").filter(Boolean);

/**
 * Diacritics, case, word order and hyphens are ignored. Every word of the stored surname and at least
 * one word of the stored first name must be typed; at most one typed word may be unknown (a second
 * first name the register does not have). A missing middle name is accepted.
 */
export function nameMatches(typed: string, person: { nume: string; prenume: string }): boolean {
  const t = words(typed);
  const surname = words(person.nume);
  const first = words(person.prenume);
  if (!t.length || !surname.length || !first.length) return false;
  const typedSet = new Set(t);
  if (!surname.every((w) => typedSet.has(w))) return false;
  if (!first.some((w) => typedSet.has(w))) return false;
  const known = new Set([...surname, ...first]);
  return t.filter((w) => !known.has(w)).length <= 1;
}

/** Digits only, compared on the last 8 (country prefixes +47 / 0047 / +40, spaces, dashes ignored). */
export function phoneMatches(typed: string, stored: string): boolean {
  const a = typed.replace(/\D/g, "");
  const b = stored.replace(/\D/g, "");
  if (a.length < 8 || b.length < 8) return false;
  return a.slice(-8) === b.slice(-8);
}

export function identityMatches(input: { nume: string; telefon: string }, person: { nume: string; prenume: string; telefon: string }): boolean {
  return nameMatches(input.nume, person) && phoneMatches(input.telefon, person.telefon);
}

/** The persons matching both the name and the phone (the general link needs exactly one). */
export function matchingPersons<P extends { nume: string; prenume: string; telefon: string }>(input: { nume: string; telefon: string }, persons: readonly P[]): P[] {
  return persons.filter((p) => identityMatches(input, p));
}
