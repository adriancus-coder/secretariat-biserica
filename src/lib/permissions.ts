import type { RoleKey } from "./labels";

/** Regulile de acces pe roluri, folosite atât pe server (autorizare) cât și în interfață (afișare butoane). */
export const permissions = {
  /** Adăugare / modificare / ștergere în registre (persoane, ședințe, documente, ...). */
  write: (role: RoleKey) => role === "ADMIN" || role === "SECRETAR",
  /** Setările organizației, nomenclatoare, utilizatori, import. */
  admin: (role: RoleKey) => role === "ADMIN",
  /** Exportul complet al datelor (conține date personale). */
  export: (role: RoleKey) => role === "ADMIN" || role === "SECRETAR",
  /** Jurnalul de modificări. */
  audit: (role: RoleKey) => role === "ADMIN" || role === "SECRETAR",
};

export type Permission = keyof typeof permissions;
