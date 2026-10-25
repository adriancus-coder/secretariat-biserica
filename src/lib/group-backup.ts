/**
 * Group fields beyond the prototype's JSON, on each group next to `membri`: `functie` and
 * `functieLider` (the linked roles, by name). Files without them import unchanged. Pure.
 */

const name = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined);

export interface GroupExtra {
  /** "Slujirea grupului", by role name. */
  functie?: string;
  /** "Funcția de conducere", by role name. */
  functieLider?: string;
}

/** Adds the extra fields to the exported groups (in place). */
export function addGroupExtras(groups: Record<string, Record<string, unknown>>, extra: ReadonlyMap<string, GroupExtra>) {
  for (const [id, x] of extra) {
    const g = groups[id];
    if (!g) continue;
    if (x.functie) g.functie = x.functie;
    if (x.functieLider) g.functieLider = x.functieLider;
  }
}

/** Group id (as in the file) → its extra fields. */
export function parseGroupExtras(root: unknown): Map<string, GroupExtra> {
  const out = new Map<string, GroupExtra>();
  const c = typeof root === "object" && root !== null ? (root as Record<string, unknown>).groups : undefined;
  if (!c || typeof c !== "object") return out;
  const entries: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  for (const [key, raw] of entries) {
    if (typeof raw !== "object" || raw === null) continue;
    const g = raw as Record<string, unknown>;
    const x: GroupExtra = { functie: name(g.functie), functieLider: name(g.functieLider) };
    if (x.functie || x.functieLider) out.set(String(g.id ?? key).trim(), x);
  }
  return out;
}
