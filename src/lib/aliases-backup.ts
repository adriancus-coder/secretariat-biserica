/**
 * Other forms of persons' names (`aliases` collection of the JSON backup): `{ membru, alias }`, the
 * member id as in the file and the normalized name. Files without it import unchanged.
 */
import { nameKey } from "./name-match";

export interface BAlias {
  membru: string;
  alias: string;
}

export function aliasesToJson(rows: readonly { personId: string; alias: string }[]): BAlias[] {
  return rows.map((r) => ({ membru: r.personId, alias: r.alias }));
}

/** null when the file has no `aliases` collection; entries without a member or a name are dropped. */
export function parseAliasesJson(root: unknown): BAlias[] | null {
  const raw = typeof root === "object" && root !== null ? (root as Record<string, unknown>).aliases : undefined;
  if (!Array.isArray(raw)) return null;
  const out: BAlias[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const membru = typeof r.membru === "string" ? r.membru : "";
    const alias = typeof r.alias === "string" ? nameKey(r.alias.slice(0, 200)) : "";
    if (!membru || !alias || seen.has(alias)) continue;
    seen.add(alias);
    out.push({ membru, alias });
  }
  return out;
}
