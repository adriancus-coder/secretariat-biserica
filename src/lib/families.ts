/** Families as records: choosing the head and the default name. Pure. */
import { ageAt } from "./dates";
import { HEAD_OF_FAMILY } from "./labels";

export interface HeadCandidate {
  id: string;
  rudenie: string;
  gen: "M" | "F" | null;
  dataNasterii: string | null;
  /** ISO date or timestamp, for the last tie-break. */
  createdAt: string | null;
}

/**
 * The head of a family: the person with rudenie "Cap de familie" (the oldest if several), else the
 * oldest adult man, else the oldest adult, else the oldest person (then the first registered).
 * The `families` migration applies the same rule in SQL.
 */
export function pickHead<T extends HeadCandidate>(members: readonly T[], today: string): T | null {
  if (!members.length) return null;
  const adult = (m: T) => m.dataNasterii !== null && ageAt(m.dataNasterii, today) >= 18;
  const rank = (m: T) => [m.rudenie === HEAD_OF_FAMILY ? 0 : 1, adult(m) && m.gen === "M" ? 0 : 1, adult(m) ? 0 : 1];
  return [...members].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    if (a.dataNasterii !== b.dataNasterii) {
      if (a.dataNasterii === null) return 1;
      if (b.dataNasterii === null) return -1;
      return a.dataNasterii < b.dataNasterii ? -1 : 1;
    }
    const ca = a.createdAt ?? "";
    const cb = b.createdAt ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/** "Fam. Daniel Mureșan": the default display name, from the head's first name and surname. */
export function defaultFamilyName(head: { nume: string; prenume: string }): string {
  return `Fam. ${`${head.prenume} ${head.nume}`.trim()}`;
}

export const FAMILY_NAME_MAX = 120;

/** The person form's family field: "" (no family), NEW_FAMILY, or a family id. */
export const NEW_FAMILY = "nou";
