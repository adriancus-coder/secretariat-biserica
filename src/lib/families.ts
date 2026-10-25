/**
 * Families as records: choosing the head and the default name. Pure. The rule applies everywhere
 * (import, repair, settling a family); the earlier `families` migration used a simpler one, which
 * "Recalculează capii de familie" repairs for families created automatically.
 */
import { ageAt } from "./dates";
import { HEAD_OF_FAMILY, type PersonStatusKey } from "./labels";

export interface HeadCandidate {
  id: string;
  statut: PersonStatusKey;
  rudenie: string;
  gen: "M" | "F" | null;
  dataNasterii: string | null;
  /** ISO date or timestamp, for the last tie-break. */
  createdAt: string | null;
}

/** A head is never a minor (under 18). A missing birth date counts as adult. */
export function canBeHead(p: { statut: PersonStatusKey; dataNasterii: string | null }, today: string): boolean {
  return p.dataNasterii === null || ageAt(p.dataNasterii, today) >= 18;
}

const STATUS_RANK: Partial<Record<PersonStatusKey, number>> = { MEMBRU: 0, APARTINATOR: 1, PRIETEN: 2 };

/**
 * The head of a family, among the persons who can be heads (canBeHead): Membru before Aparținător
 * before Prieten (then others), then rudenie "Cap de familie", then men, then the oldest known birth
 * date, then the first registered. null when nobody can be head (only children).
 */
export function pickHead<T extends HeadCandidate>(members: readonly T[], today: string): T | null {
  const eligible = members.filter((m) => canBeHead(m, today));
  if (!eligible.length) return null;
  const rank = (m: T) => [STATUS_RANK[m.statut] ?? 3, m.rudenie === HEAD_OF_FAMILY ? 0 : 1, m.gen === "M" ? 0 : 1];
  return [...eligible].sort((a, b) => {
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
