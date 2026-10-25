/**
 * Baptism details in the JSON backup: `botezBiserica`, `botezLocalitate` and `botezOficiant` on each
 * member, next to the prototype's `locBotez` (written with the locality, for older readers). Files
 * without them import `locBotez` as the locality. `botezAn` (the year, for a baptism known only by
 * its year) is written when set; files without it take the year from `dataBotez`.
 */

export interface BaptismFields {
  botezBiserica: string;
  botezLocalitate: string;
  botezOficiant: string;
  botezAn: number | null;
}

const KEYS = ["botezBiserica", "botezLocalitate", "botezOficiant", "botezAn"] as const;
const year = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1900 && v <= 2200 ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 160) : "");

/** Adds the three fields to the exported members (in place). */
export function addMemberBaptism(members: Record<string, Record<string, unknown>>, baptism: ReadonlyMap<string, BaptismFields>) {
  for (const [id, b] of baptism) {
    const m = members[id];
    if (!m) continue;
    const { botezAn, ...rest } = b;
    Object.assign(m, rest, botezAn !== null ? { botezAn } : {});
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
    out.set(String(r.id ?? key), {
      botezBiserica: str(r.botezBiserica),
      botezLocalitate: str(r.botezLocalitate),
      botezOficiant: str(r.botezOficiant),
      botezAn: year(r.botezAn),
    });
  }
  return out;
}

/**
 * The fields to store for an imported member: the file's, else the old `locBotez` as the locality.
 * The year comes from the full date when there is one.
 */
export function importedBaptism(fromFile: BaptismFields | undefined, locBotez: string, dataBotez: string | null): BaptismFields {
  const b = fromFile ?? { botezBiserica: "", botezLocalitate: locBotez, botezOficiant: "", botezAn: null };
  return { ...b, botezAn: dataBotez ? Number(dataBotez.slice(0, 4)) : b.botezAn };
}
