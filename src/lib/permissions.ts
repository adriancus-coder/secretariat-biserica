import type { RoleKey } from "./labels";

/**
 * Who asks: the base role, and the pastor flag (Statut art. 38–39), independent of the role so a pastor
 * can also be an administrator. A bare role means "not a pastor".
 */
export type Who = RoleKey | { role: RoleKey; isPastor?: boolean };

const roleOf = (w: Who): RoleKey => (typeof w === "string" ? w : w.role);
const pastorOf = (w: Who): boolean => typeof w !== "string" && w.isPastor === true;

/** Regulile de acces pe roluri, folosite atât pe server (autorizare) cât și în interfață (afișare butoane). */
export const permissions = {
  /** Adăugare / modificare / ștergere în registre (persoane, ședințe, documente, ...). */
  write: (w: Who) => roleOf(w) === "ADMIN" || roleOf(w) === "SECRETAR",
  /** Setările organizației, nomenclatoare, utilizatori, import. */
  admin: (w: Who) => roleOf(w) === "ADMIN",
  /** Exportul complet al datelor (conține date personale). */
  export: (w: Who) => roleOf(w) === "ADMIN" || roleOf(w) === "SECRETAR",
  /** Jurnalul de modificări. */
  audit: (w: Who) => roleOf(w) === "ADMIN" || roleOf(w) === "SECRETAR",
  /** Disciplinary measures (Statut art. 27): a pastor or an administrator, for every read and write. */
  disciplina: (w: Who) => roleOf(w) === "ADMIN" || pastorOf(w),
  /** The pastor's own work (Statut art. 38–39): approvals, signatures as pastor, the pastor's dashboard. */
  pastor: (w: Who) => pastorOf(w),
  /** Confidential pastoral notes (Statut art. 39 alin. 3): pastors only — not administrators. */
  pastoral: (w: Who) => pastorOf(w),
};

export type Permission = keyof typeof permissions;
