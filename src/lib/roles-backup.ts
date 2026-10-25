import { isIsoDate } from "./dates";
import { ROLE_NAME_MAX } from "./schemas/roles";

/**
 * Church roles in the JSON backup: a `roleGroups` collection, a `roles` collection (the entries, each
 * with its group's name in `grup`), a `functii` list on each member by role name, and `inComitet` on
 * members. All sit next to the prototype's collections (src/domain/backup.ts ignores keys it does not
 * know), so files without them import unchanged. Older files have no groups (their roles land in the
 * first group) and mark committee roles with `comitet`, from which the committee flag is derived.
 */
export interface BRole {
  id: string;
  nume: string;
  ordine: number;
  /** The group's name ("" in older files). */
  grup: string;
  /** Older files only: holders of this role formed the committee. */
  comitet: boolean;
  activ: boolean;
}

export interface BRoleGroup {
  id: string;
  nume: string;
  ordine: number;
  activ: boolean;
}

export interface BPersonRole {
  nume: string;
  /** ISO dates or null. */
  din: string | null;
  pana: string | null;
}

export function rolesToJson(list: Omit<BRole, "comitet">[]): Record<string, Omit<BRole, "comitet">> {
  return Object.fromEntries(list.map((r) => [r.id, r]));
}

export function roleGroupsToJson(list: BRoleGroup[]): Record<string, BRoleGroup> {
  return Object.fromEntries(list.map((g) => [g.id, g]));
}

/** Adds `inComitet: true` to the exported members of the committee (in place). */
export function addMemberCommittee(members: Record<string, Record<string, unknown>>, committee: ReadonlySet<string>) {
  for (const id of committee) if (members[id]) members[id].inComitet = true;
}

/** Adds `functii` to the exported members (in place). */
export function addMemberRoles(members: Record<string, Record<string, unknown>>, functii: ReadonlyMap<string, BPersonRole[]>) {
  for (const [id, list] of functii) {
    if (members[id] && list.length) members[id].functii = list;
  }
}

export interface ParsedRoles {
  /** null when the file has no `roleGroups` collection. */
  groups: BRoleGroup[] | null;
  /** null when the file has no `roles` collection. */
  roles: BRole[] | null;
  /** Member id → committee flag, for members carrying `inComitet` (files from this version on). */
  committee: Map<string, boolean>;
  /** Member id (as in the file) → roles held. Only members that carry a `functii` list. */
  functii: Map<string, BPersonRole[]>;
  errors: string[];
  warnings: string[];
}

const name = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, ROLE_NAME_MAX) : "");
const day = (v: unknown) => (typeof v === "string" && isIsoDate(v.slice(0, 10)) ? v.slice(0, 10) : null);

function entries(c: unknown): [string, Record<string, unknown>][] {
  if (c === undefined || c === null || typeof c !== "object") return [];
  const list: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  return list.filter((e): e is [string, Record<string, unknown>] => typeof e[1] === "object" && e[1] !== null);
}

export function parseRolesJson(root: unknown): ParsedRoles {
  const out: ParsedRoles = { groups: null, roles: null, committee: new Map(), functii: new Map(), errors: [], warnings: [] };
  if (typeof root !== "object" || root === null) return out;
  const r = root as Record<string, unknown>;

  if (r.roleGroups !== undefined && r.roleGroups !== null) {
    out.groups = [];
    const seen = new Set<string>();
    for (const [key, x] of entries(r.roleGroups)) {
      const nume = name(x.nume);
      if (!nume) {
        out.errors.push(`Grupul de funcții „${key}”: denumirea lipsește.`);
        continue;
      }
      if (seen.has(nume.toLowerCase())) continue;
      seen.add(nume.toLowerCase());
      out.groups.push({
        id: String(x.id ?? key),
        nume,
        ordine: typeof x.ordine === "number" && Number.isFinite(x.ordine) ? x.ordine : out.groups.length,
        activ: x.activ !== false,
      });
    }
  }

  if (r.roles !== undefined && r.roles !== null) {
    out.roles = [];
    const seen = new Set<string>();
    for (const [key, x] of entries(r.roles)) {
      const nume = name(x.nume);
      if (!nume) {
        out.errors.push(`Funcția „${key}”: denumirea lipsește.`);
        continue;
      }
      const lower = nume.toLowerCase();
      if (seen.has(lower)) {
        out.warnings.push(`Funcția „${nume}” apare de două ori; s-a păstrat prima.`);
        continue;
      }
      seen.add(lower);
      out.roles.push({
        id: String(x.id ?? key),
        nume,
        ordine: typeof x.ordine === "number" && Number.isFinite(x.ordine) ? x.ordine : out.roles.length,
        grup: name(x.grup),
        comitet: x.comitet === true,
        activ: x.activ !== false,
      });
    }
  }

  for (const [key, m] of entries(r.members)) {
    if (typeof m.inComitet === "boolean") out.committee.set(String(m.id ?? key).trim(), m.inComitet);
    if (!Array.isArray(m.functii)) continue;
    const id = String(m.id ?? key).trim();
    const list: BPersonRole[] = [];
    const seen = new Set<string>();
    for (const f of m.functii) {
      const nume = name(typeof f === "string" ? f : (f as { nume?: unknown })?.nume);
      if (!nume || seen.has(nume.toLowerCase())) continue;
      seen.add(nume.toLowerCase());
      const o = typeof f === "object" && f !== null ? (f as Record<string, unknown>) : {};
      list.push({ nume, din: day(o.din), pana: day(o.pana) });
    }
    if (list.length) out.functii.set(id, list);
  }
  return out;
}
