/**
 * Parent-child links of the register in the JSON backup (KINSHIP, KINSHIP-STATUTE-PARENTS):
 * `rudenii` = `{ parinte | parinteExtern, copil, sursa }` (the member ids, or the id of a parent outside
 * the register, as in the file) and `parintiExterni` = `{ id, nume, gen }` (only the name written on the
 * children's files and the gender). Files without them import unchanged.
 */
export const KINSHIP_SOURCES = ["FAMILIE", "MANUAL", "CAMPANIE", "NUME_PARINTI"] as const;
export type KinshipSourceKey = (typeof KINSHIP_SOURCES)[number];

export interface BKinship {
  /** A person of the register… */
  parinte?: string;
  /** …or a parent outside it (an id of `parintiExterni`). */
  parinteExtern?: string;
  copil: string;
  sursa: KinshipSourceKey;
}

export interface BExternalParent {
  id: string;
  nume: string;
  gen: "M" | "F";
}

const source = (s: unknown): KinshipSourceKey => (typeof s === "string" && (KINSHIP_SOURCES as readonly string[]).includes(s) ? (s as KinshipSourceKey) : "MANUAL");

export function kinshipToJson(rows: readonly { parentId: string | null; externalParentId: string | null; childId: string; source: string }[]): BKinship[] {
  return rows.map((r) => ({ ...(r.parentId ? { parinte: r.parentId } : { parinteExtern: r.externalParentId! }), copil: r.childId, sursa: source(r.source) }));
}

export function externalParentsToJson(rows: readonly { id: string; nume: string; gen: string }[]): BExternalParent[] {
  return rows.map((r) => ({ id: r.id, nume: r.nume, gen: r.gen === "F" ? "F" : "M" }));
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
    const parinteExtern = typeof r.parinteExtern === "string" ? r.parinteExtern.slice(0, 64) : "";
    const copil = typeof r.copil === "string" ? r.copil.slice(0, 64) : "";
    // Exactly one parent: a person of the register or a parent outside it.
    if (!copil || Boolean(parinte) === Boolean(parinteExtern) || parinte === copil) continue;
    const k = `${parinte || `x:${parinteExtern}`}>${copil}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...(parinte ? { parinte } : { parinteExtern }), copil, sursa: source(r.sursa) });
  }
  return out;
}

/** null when the file has no `parintiExterni` collection; entries without a name are dropped. */
export function parseExternalParentsJson(root: unknown): BExternalParent[] | null {
  const raw = typeof root === "object" && root !== null ? (root as Record<string, unknown>).parintiExterni : undefined;
  if (!Array.isArray(raw)) return null;
  const out: BExternalParent[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.slice(0, 64) : "";
    const nume = typeof r.nume === "string" ? r.nume.trim().slice(0, 200) : "";
    if (!id || !nume) continue;
    out.push({ id, nume, gen: r.gen === "F" ? "F" : "M" });
  }
  return out;
}
