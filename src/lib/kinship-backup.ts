/**
 * Parent-child links of the register (`rudenii` collection of the JSON backup, KINSHIP):
 * `{ parinte, copil, sursa }`, the member ids as in the file. Files without it import unchanged.
 */
export const KINSHIP_SOURCES = ["FAMILIE", "MANUAL", "CAMPANIE"] as const;
export type KinshipSourceKey = (typeof KINSHIP_SOURCES)[number];

export interface BKinship {
  parinte: string;
  copil: string;
  sursa: KinshipSourceKey;
}

export function kinshipToJson(rows: readonly { parentId: string; childId: string; source: string }[]): BKinship[] {
  return rows.map((r) => ({ parinte: r.parentId, copil: r.childId, sursa: (KINSHIP_SOURCES as readonly string[]).includes(r.source) ? (r.source as KinshipSourceKey) : "MANUAL" }));
}

/** null when the file has no `rudenii` collection; malformed entries, self-links and repeats are dropped. */
export function parseKinshipJson(root: unknown): BKinship[] | null {
  const raw = typeof root === "object" && root !== null ? (root as Record<string, unknown>).rudenii : undefined;
  if (!Array.isArray(raw)) return null;
  const out: BKinship[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const parinte = typeof r.parinte === "string" ? r.parinte.slice(0, 64) : "";
    const copil = typeof r.copil === "string" ? r.copil.slice(0, 64) : "";
    if (!parinte || !copil || parinte === copil || seen.has(`${parinte}>${copil}`)) continue;
    seen.add(`${parinte}>${copil}`);
    const sursa = typeof r.sursa === "string" && (KINSHIP_SOURCES as readonly string[]).includes(r.sursa) ? (r.sursa as KinshipSourceKey) : "MANUAL";
    out.push({ parinte, copil, sursa });
  }
  return out;
}
