import "server-only";
import { fromDbDate } from "@/lib/dates";
import type { Ctx } from "../session";

export interface RoleRow {
  id: string;
  nume: string;
  sortOrder: number;
  inCommittee: boolean;
  active: boolean;
  /** Persons holding the role. */
  holders: number;
}

/** All church roles in their display order, with the number of holders. */
export async function listRoles(ctx: Ctx): Promise<RoleRow[]> {
  const rows = await ctx.db.churchRole.findMany({
    orderBy: [{ sortOrder: "asc" }, { nume: "asc" }],
    include: { _count: { select: { holders: true } } },
  });
  return rows.map(({ _count, id, nume, sortOrder, inCommittee, active }) => ({
    id,
    nume,
    sortOrder,
    inCommittee,
    active,
    holders: _count.holders,
  }));
}

export interface PersonRoleView {
  roleId: string;
  nume: string;
  inCommittee: boolean;
  active: boolean;
  since: string | null;
}

/** The roles held by a person, in the church's role order. */
export async function personRoles(ctx: Ctx, personId: string): Promise<PersonRoleView[]> {
  const rows = await ctx.db.churchRole.findMany({
    where: { holders: { some: { personId } } },
    orderBy: [{ sortOrder: "asc" }, { nume: "asc" }],
    select: { id: true, nume: true, inCommittee: true, active: true, holders: { where: { personId }, select: { since: true } } },
  });
  return rows.map((r) => ({
    roleId: r.id,
    nume: r.nume,
    inCommittee: r.inCommittee,
    active: r.active,
    since: fromDbDate(r.holders[0]?.since ?? null),
  }));
}

/** Roles offered on the person form: the active ones, plus inactive ones the person already holds. */
export async function roleChoices(ctx: Ctx, personId: string | null) {
  return ctx.db.churchRole.findMany({
    where: personId ? { OR: [{ active: true }, { holders: { some: { personId } } }] } : { active: true },
    orderBy: [{ sortOrder: "asc" }, { nume: "asc" }],
    select: { id: true, nume: true, inCommittee: true, active: true },
  });
}

/** The person's roles as the JSON value of the person form's hidden `functii` field. */
export function rolesFieldValue(roles: PersonRoleView[]): string {
  return JSON.stringify(roles.map((r) => ({ id: r.roleId, din: r.since ?? "" })));
}
