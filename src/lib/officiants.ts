/**
 * Who may officiate acts of worship (Statut art. 30). Pure.
 * - Ordained roles are marked on the nomenclature (`ChurchRole.ordinat`); their holders are offered as
 *   officiants, and free text stays allowed (officiants from other churches).
 * - Diaconii oficiază Cina Domnului, binecuvântări de copii și înmormântări, sub îndrumarea pastorului sau
 *   a prezbiterului (art. 30 alin. 1 lit. a): a diacon named for a baptism or a wedding gets a warning.
 */
import { nameKey } from "./name-match";
import { roleKey } from "./roles";

export const ORDINATIONS = ["DIACON", "PREZBITER", "PASTOR"] as const;
export type Ordination = (typeof ORDINATIONS)[number];
export const ORDINATION_LABEL: Record<Ordination, string> = { DIACON: "Diacon", PREZBITER: "Prezbiter", PASTOR: "Pastor" };
const RANK: Record<Ordination, number> = { DIACON: 1, PREZBITER: 2, PASTOR: 3 };

/** The default ordained roles, by name (signup and the `officiants` migration). */
export function defaultOrdination(roleName: string): Ordination | null {
  const k = roleKey(roleName);
  return ORDINATIONS.find((o) => roleKey(ORDINATION_LABEL[o]) === k) ?? null;
}

/** The highest ordination among a person's roles. */
export function highestOrdination(list: readonly (Ordination | null)[]): Ordination | null {
  return list.reduce<Ordination | null>((best, o) => (o && (!best || RANK[o] > RANK[best]) ? o : best), null);
}

/** Event types with an officiant (art. 30). */
export const OFFICIATED_EVENT_TYPES = ["Botez", "Binecuvântare copil", "Nuntă", "Înmormântare", "Cina Domnului"] as const;
export const isOfficiatedEvent = (tip: string) => OFFICIATED_EVENT_TYPES.some((t) => roleKey(t) === roleKey(tip));

/** Acts a diacon does not officiate on his own (art. 30 alin. 1 lit. a). */
const NOT_FOR_DEACONS = ["Botez", "Nuntă"].map(roleKey);

export interface OfficiantOption {
  /** "Ioan Pop" */
  name: string;
  ordinat: Ordination;
}

/** The person a typed officiant names ("pastor Ioan Pop", "Pop Ioan"), when one of the options. */
export function matchOfficiant(text: string, options: readonly OfficiantOption[]): OfficiantOption | null {
  const titles = new Set(["pastor", "pastorul", "prezbiter", "prezbiterul", "diacon", "diaconul", "fratele", "fr"]);
  const key = nameKey(text.split(/\s+/).filter((w) => !titles.has(roleKey(w).replace(/\.$/, ""))).join(" "));
  if (!key) return null;
  return options.find((o) => nameKey(o.name) === key) ?? null;
}

export const DEACON_WARNING =
  "Statut art. 30 alin. 1 lit. a: diaconii oficiază Cina Domnului, binecuvântări de copii și înmormântări, sub îndrumarea pastorului sau a prezbiterului.";

/** The warning for an officiant of the given act ("Botez" for a baptism), or null. Never blocking. */
export function officiantWarning(act: string, text: string, options: readonly OfficiantOption[]): string | null {
  if (!NOT_FOR_DEACONS.includes(roleKey(act))) return null;
  return matchOfficiant(text, options)?.ordinat === "DIACON" ? DEACON_WARNING : null;
}
