import { ageAt } from "./dates";
import { BELIEVER_RELATIONS, type PersonStatusKey } from "./labels";

/**
 * The aparținător kind (Statut art. 28 alin. 1), derived, never stored: a) a minor, unbaptised, in a
 * family whose head, spouse or parent is a member; b) every other aparținător. Same rule as
 * computeStats' apartA / apartB. null for other statuses.
 */
export function apartinatorKind(
  p: { statut: PersonStatusKey; dataNasterii: string | null; baptised: boolean },
  family: readonly { id: string; statut: PersonStatusKey; rudenie: string; dataIesire: unknown }[],
  headId: string | null,
  today: string,
): "a" | "b" | null {
  if (p.statut !== "APARTINATOR") return null;
  const minor = p.dataNasterii !== null && ageAt(p.dataNasterii, today) < 18;
  const believers = family.some((m) => m.statut === "MEMBRU" && !m.dataIesire && (m.id === headId || BELIEVER_RELATIONS.includes(m.rudenie)));
  return minor && !p.baptised && believers ? "a" : "b";
}
