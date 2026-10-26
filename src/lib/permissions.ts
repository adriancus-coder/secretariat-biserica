import type { RoleKey } from "./labels";

/**
 * Who asks: the base role, and the pastor flag (Statut art. 38–39), independent of the role so a pastor
 * can also be an administrator. A bare role means "not a pastor".
 */
export type Who = RoleKey | { role: RoleKey; isPastor?: boolean; accesDisciplina?: boolean };

const roleOf = (w: Who): RoleKey => (typeof w === "string" ? w : w.role);
/** The "Rugăciune" role sees only the family of the week and its own account, so it is never a pastor. */
const pastorOf = (w: Who): boolean => typeof w !== "string" && w.isPastor === true && w.role !== "RUGACIUNE";

const disciplineAccessOf = (w: Who): boolean => typeof w !== "string" && w.accesDisciplina === true;

/**
 * Who gives and takes back access to the disciplinary measures (Statut art. 44 lit. d): a pastor; in a
 * church without any pastor user, an Administrator who has the access himself. Nobody gives it to himself
 * (checked by the action).
 */
export function canGrantDiscipline(w: Who, churchHasPastor: boolean): boolean {
  if (roleOf(w) === "RUGACIUNE") return false;
  return pastorOf(w) || (!churchHasPastor && roleOf(w) === "ADMIN" && disciplineAccessOf(w));
}

/** Regulile de acces pe roluri, folosite atât pe server (autorizare) cât și în interfață (afișare butoane). */
export const permissions = {
  /**
   * The register and every page or action that asks for no stricter permission (`requireCtx()` /
   * `actionCtx()` default to it): every role except "Rugăciune".
   */
  read: (w: Who) => roleOf(w) !== "RUGACIUNE",
  /** The user's own account (Cont: password, two-step, passkeys, notifications): every role. */
  account: () => true,
  /** The weekly prayer for families (/rugaciune): the family of the week, nothing else from the register. */
  rugaciune: (w: Who) => roleOf(w) === "ADMIN" || roleOf(w) === "SECRETAR" || roleOf(w) === "RUGACIUNE",
  /** Adăugare / modificare / ștergere în registre (persoane, ședințe, documente, ...). */
  write: (w: Who) => roleOf(w) === "ADMIN" || roleOf(w) === "SECRETAR",
  /** Setările organizației, nomenclatoare, utilizatori, import. */
  admin: (w: Who) => roleOf(w) === "ADMIN",
  /** Exportul complet al datelor (conține date personale). */
  export: (w: Who) => roleOf(w) === "ADMIN" || roleOf(w) === "SECRETAR",
  /** Jurnalul de modificări. */
  audit: (w: Who) => roleOf(w) === "ADMIN" || roleOf(w) === "SECRETAR",
  /**
   * Disciplinary measures (Statut art. 27; art. 44 lit. d: the committee, under the pastor's coordination,
   * decides and applies them): a pastor, or an Administrator / Secretar to whom a pastor gave access
   * (User.accesDisciplina). Never by role alone: the application's administrator is a technical role
   * (art. 14 alin. 3 lit. d). Never Vizualizare or Rugăciune.
   */
  disciplina: (w: Who) => pastorOf(w) || (disciplineAccessOf(w) && (roleOf(w) === "ADMIN" || roleOf(w) === "SECRETAR")),
  /** The pastor's own work (Statut art. 38–39): approvals, signatures as pastor, the pastor's dashboard. */
  pastor: (w: Who) => pastorOf(w),
  /** Confidential pastoral notes (Statut art. 39 alin. 3): pastors only — not administrators. */
  pastoral: (w: Who) => pastorOf(w),
};

export type Permission = keyof typeof permissions;
