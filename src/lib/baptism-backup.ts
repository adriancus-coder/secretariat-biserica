/**
 * Baptism details in the JSON backup: `botezBiserica`, `botezLocalitate` and `botezOficiant` on each
 * member, next to the prototype's `locBotez` (written with the locality, for older readers). Files
 * without them import `locBotez` as the locality.
 */

export interface BaptismFields {
  botezBiserica: string;
  botezLocalitate: string;
  botezOficiant: string;
}

const KEYS = ["botezBiserica", "botezLocalitate", "botezOficiant"] as const;
const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 160) : "");

/** Adds the three fields to the exported members (in place). */
export function addMemberBaptism(members: Record<string, Record<string, unknown>>, baptism: ReadonlyMap<string, BaptismFields>) {
  for (const [id, b] of baptism) {
    const m = members[id];
    if (m) Object.assign(m, b);
  }
}

/** Member id (as in the file) → its baptism fields, for members that carry at least one of them. */
export function parseMemberBaptism(root: unknown): Map<string, BaptismFields> {
  const out = new Map<string, BaptismFields>();
  const members = typeof root === "object" && root !== null ? (root as Record<string, unknown>).members : null;
  if (typeof members !== "object" || members === null) return out;
  const list: [string, unknown][] = Array.isArray(members)
    ? members.map((m, i) => [String((m as { id?: unknown })?.id ?? i), m])
    : Object.entries(members);
  for (const [key, m] of list) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    if (!KEYS.some((k) => k in r)) continue;
    out.set(String(r.id ?? key), { botezBiserica: str(r.botezBiserica), botezLocalitate: str(r.botezLocalitate), botezOficiant: str(r.botezOficiant) });
  }
  return out;
}

/** The fields to store for an imported member: the file's, else the old `locBotez` as the locality. */
export function importedBaptism(fromFile: BaptismFields | undefined, locBotez: string): BaptismFields {
  return fromFile ?? { botezBiserica: "", botezLocalitate: locBotez, botezOficiant: "" };
}
