import type { RoleKey } from "./labels";
import { permissions } from "./permissions";

/**
 * Statut art. 14 alin. 3 lit. b and the privacy notice (point 6): after any exit, a person's contact
 * data (phone, e-mail, address) are restricted to administrators, and they are deleted at most 12
 * months later. Register data are never affected.
 */
export function contactRestricted(p: { dataIesire: Date | string | null; statut?: string }, role: RoleKey): boolean {
  return (p.dataIesire !== null || p.statut === "FOST_MEMBRU") && !permissions.admin(role);
}

/** The months after an exit when contact data are due for deletion. */
export const CONTACT_RETENTION_MONTHS = 12;
