/** Church roles (funcții în biserică): defaults and display helpers. Pure. */
import { fmt } from "./format";

/**
 * Roles created for every new church (and backfilled by the `church_roles` migration;
 * keep the two lists in sync). `inCommittee` holders form the committee.
 */
export const DEFAULT_CHURCH_ROLES: readonly { nume: string; inCommittee: boolean }[] = [
  { nume: "Pastor", inCommittee: true },
  { nume: "Prezbiter", inCommittee: true },
  { nume: "Diacon", inCommittee: true },
  { nume: "Secretar", inCommittee: true },
  { nume: "Casier", inCommittee: true },
  { nume: "Membru comitet", inCommittee: true },
  { nume: "Lider tineret", inCommittee: false },
  { nume: "Lider cor", inCommittee: false },
  { nume: "Lider copii", inCommittee: false },
  { nume: "Responsabil media", inCommittee: false },
];

export function defaultRolesData() {
  return DEFAULT_CHURCH_ROLES.map((r, sortOrder) => ({ ...r, sortOrder }));
}

/** URL value of the Persoane filter for "any committee role". */
export const COMMITTEE_FILTER = "comitet";

export interface HeldRole {
  nume: string;
  since: string | null;
}

/** "Diacon (din 1 feb 2020), Lider cor": the comparable view of a person's roles in the audit log. */
export function rolesText(roles: readonly HeldRole[]): string {
  return roles.map((r) => (r.since ? `${r.nume} (din ${fmt(r.since)})` : r.nume)).join(", ");
}
