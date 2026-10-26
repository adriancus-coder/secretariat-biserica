/**
 * Norwegian address format: "Ulveveien 20, 4323 Sandnes" — street and number, a comma, one space,
 * the four-digit postal code, one space, the locality. Every place that shows an address goes
 * through formatAddress(); nothing concatenates the parts by hand.
 */

export interface AddressParts {
  adresa: string;
  codPostal: string;
  localitate: string;
}

export const POSTAL_CODE_RE = /^\d{4}$/;

const squash = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** "Stradă nr, 4323 Sandnes". Empty parts are skipped without extra commas or spaces. */
export function formatAddress(a: Partial<AddressParts> | null | undefined): string {
  const street = squash(a?.adresa);
  const place = [squash(a?.codPostal), squash(a?.localitate)].filter(Boolean).join(" ");
  return [street, place].filter(Boolean).join(", ");
}

/** The three fields of an old single-line address, or null when it has no "<4 digits> <locality>" tail. */
const LEGACY_RE = /^(.+?)[,\s]+(\d{4})\s+([^\d,\s][^,]*)$/;

/** Capitalise the first letter only when the text was written entirely in lower case. */
export function capitalizeIfLower(s: string): string {
  if (!s || s !== s.toLocaleLowerCase("ro")) return s;
  return s.charAt(0).toLocaleUpperCase("ro") + s.slice(1);
}

/**
 * Splits "<street>[, ]<4 digits> <locality>" (the comma is optional) into the three fields.
 * Multiple spaces collapse to one; a part written only in lower case gets its first letter capitalised,
 * anything else is left as typed. Returns null when the text does not match (it stays whole in `adresa`).
 * The same rule runs in SQL in the migration `address_format`.
 */
export function splitLegacyAddress(raw: string | null | undefined): AddressParts | null {
  const m = LEGACY_RE.exec(squash(raw));
  if (!m) return null;
  return { adresa: capitalizeIfLower(m[1]), codPostal: m[2], localitate: capitalizeIfLower(m[3].trim()) };
}

/**
 * Fields as the register stores them from input that may be an old single-line address (JSON backups,
 * Excel imports, applications): separate fields win; with no postal code and no locality, `adresa` is split.
 */
export function addressFromInput(i: { adresa?: unknown; codPostal?: unknown; localitate?: unknown }): AddressParts {
  const adresa = typeof i.adresa === "string" ? squash(i.adresa) : "";
  const codPostal = typeof i.codPostal === "string" ? squash(i.codPostal) : "";
  const localitate = typeof i.localitate === "string" ? squash(i.localitate) : "";
  if (!codPostal && !localitate) return splitLegacyAddress(adresa) ?? { adresa, codPostal, localitate };
  return { adresa, codPostal, localitate };
}

export function hasPostalCode(a: Partial<AddressParts>): boolean {
  return POSTAL_CODE_RE.test((a.codPostal ?? "").trim());
}
