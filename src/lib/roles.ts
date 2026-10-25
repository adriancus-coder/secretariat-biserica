/** Church roles (funcții în biserică): defaults and display helpers. Pure. */
import { defaultOrdination } from "./officiants";
import { fmt } from "./format";

/**
 * The role groups and entries created for every new church (and by the `person_form_polish`
 * migration for existing ones; keep the two in sync).
 */
export const DEFAULT_ROLE_GROUPS: readonly { nume: string; roles: readonly string[] }[] = [
  { nume: "Funcții", roles: ["Pastor", "Prezbiter", "Diacon", "Secretar", "Casier"] },
  { nume: "Slujiri", roles: ["Laudă și închinare", "Cor", "Media", "Copii", "Tineret", "Evanghelizare", "Întreținere"] },
];

/** Rows for the default groups and their roles (ids generated here so the roles can reference their group). */
export function defaultRoleGroupsData(churchId: string, newId: () => string) {
  let order = 0;
  const groups = DEFAULT_ROLE_GROUPS.map((g, sortOrder) => ({ id: newId(), churchId, nume: g.nume, sortOrder }));
  // Pastor, Prezbiter and Diacon are ordained ministries (Statut art. 30): offered as officiants.
  const roles = DEFAULT_ROLE_GROUPS.flatMap((g, i) =>
    g.roles.map((nume) => ({ churchId, nume, groupId: groups[i].id, sortOrder: order++, ordinat: defaultOrdination(nume) })),
  );
  return { groups, roles };
}

/** Role names compared without case and diacritics ("Lauda si inchinare" = "Laudă și închinare"). */
export function roleKey(nume: string): string {
  return nume.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** URL value of the Persoane filter for persons without a family. */
export const NO_FAMILY_FILTER = "fara-familie";

/** URL value of the Persoane filter for the committee (persons with the committee flag). */
export const COMMITTEE_FILTER = "comitet";

export interface HeldRole {
  nume: string;
  since: string | null;
}

/** "Diacon (din 1 feb 2020), Lider cor": the comparable view of a person's roles in the audit log. */
export function rolesText(roles: readonly HeldRole[]): string {
  return roles.map((r) => (r.since ? `${r.nume} (din ${fmt(r.since)})` : r.nume)).join(", ");
}
