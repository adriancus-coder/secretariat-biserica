import "server-only";
import { fromDbDate, toDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
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

/** Current holders of a role (in the record, no past end date), for a one-off copy into a group. */
export async function roleHolders(ctx: Ctx, roleId: string): Promise<string[]> {
  const today = toDbDate(todayIso())!;
  const rows = await ctx.db.person.findMany({
    where: { dataIesire: null, roles: { some: { roleId, OR: [{ until: null }, { until: { gte: today } }] } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export interface CommitteeMember {
  id: string;
  name: string;
  roles: string[];
}

/** The committee today: persons in the record holding an active committee role, in role order. */
export async function committee(ctx: Ctx): Promise<CommitteeMember[]> {
  const today = toDbDate(todayIso())!;
  const roles = await ctx.db.churchRole.findMany({
    where: { inCommittee: true, active: true },
    orderBy: [{ sortOrder: "asc" }, { nume: "asc" }],
    select: {
      nume: true,
      holders: {
        where: { OR: [{ until: null }, { until: { gte: today } }], person: { dataIesire: null } },
        select: { person: { select: { id: true, nume: true, prenume: true, sortKey: true } } },
      },
    },
  });
  const byPerson = new Map<string, CommitteeMember & { rank: number; sortKey: string }>();
  roles.forEach((r, rank) => {
    for (const { person } of r.holders) {
      const m = byPerson.get(person.id) ?? { id: person.id, name: memberName(person), roles: [], rank, sortKey: person.sortKey };
      m.roles.push(r.nume);
      byPerson.set(person.id, m);
    }
  });
  return [...byPerson.values()]
    .sort((a, b) => a.rank - b.rank || a.sortKey.localeCompare(b.sortKey))
    .map(({ id, name, roles: list }) => ({ id, name, roles: list }));
}
