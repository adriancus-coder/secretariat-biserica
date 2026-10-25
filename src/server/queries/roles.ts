import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { compareRo } from "@/lib/text";
import type { Ctx } from "../session";

/** Roles in display order: by group, then within the group. */
export const ROLE_ORDER = [
  { group: { sortOrder: "asc" } },
  { sortOrder: "asc" },
  { nume: "asc" },
] satisfies Prisma.ChurchRoleOrderByWithRelationInput[];

const GROUP_ORDER = [{ sortOrder: "asc" }, { nume: "asc" }] satisfies Prisma.RoleGroupOrderByWithRelationInput[];

export interface RoleRow {
  id: string;
  nume: string;
  groupId: string;
  sortOrder: number;
  active: boolean;
  /** Persons holding the role. */
  holders: number;
  /** Groups linked to the role (as their ministry or their leader role), by name. */
  groups: string[];
}

export interface RoleGroupRow {
  id: string;
  nume: string;
  sortOrder: number;
  active: boolean;
  roles: RoleRow[];
}

/** All role groups in their display order, each with its roles and the number of holders. */
export async function listRoleGroups(ctx: Ctx): Promise<RoleGroupRow[]> {
  const groups = await ctx.db.roleGroup.findMany({
    orderBy: GROUP_ORDER,
    include: {
      roles: {
        orderBy: [{ sortOrder: "asc" }, { nume: "asc" }],
        include: { _count: { select: { holders: true } }, groups: { select: { nume: true } }, ledGroups: { select: { nume: true } } },
      },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    nume: g.nume,
    sortOrder: g.sortOrder,
    active: g.active,
    roles: g.roles.map(({ _count, id, nume, groupId, sortOrder, active, groups, ledGroups }) => ({
      id,
      nume,
      groupId,
      sortOrder,
      active,
      holders: _count.holders,
      groups: [...new Set([...groups, ...ledGroups].map((x) => x.nume))].sort(compareRo),
    })),
  }));
}

/** All roles in display order (groups flattened), with the number of holders. */
export async function listRoles(ctx: Ctx): Promise<RoleRow[]> {
  return (await listRoleGroups(ctx)).flatMap((g) => g.roles);
}

export interface PersonRoleView {
  roleId: string;
  nume: string;
  groupId: string;
  groupName: string;
  active: boolean;
  since: string | null;
}

/** The roles held by a person, in display order. */
export async function personRoles(ctx: Ctx, personId: string): Promise<PersonRoleView[]> {
  const rows = await ctx.db.churchRole.findMany({
    where: { holders: { some: { personId } } },
    orderBy: ROLE_ORDER,
    select: {
      id: true,
      nume: true,
      active: true,
      group: { select: { id: true, nume: true } },
      holders: { where: { personId }, select: { since: true } },
    },
  });
  return rows.map((r) => ({
    roleId: r.id,
    nume: r.nume,
    groupId: r.group.id,
    groupName: r.group.nume,
    active: r.active,
    since: fromDbDate(r.holders[0]?.since ?? null),
  }));
}

export interface RoleChoiceGroup {
  id: string;
  nume: string;
  roles: { id: string; nume: string; active: boolean }[];
}

/**
 * The blocks of the person form: the active groups with their active roles, plus inactive roles
 * (or groups) that the person already holds, so saving never drops them.
 */
export async function roleChoices(ctx: Ctx, personId: string | null): Promise<RoleChoiceGroup[]> {
  const held = personId ? { holders: { some: { personId } } } : null;
  const groups = await ctx.db.roleGroup.findMany({
    where: held ? { OR: [{ active: true }, { roles: { some: held } }] } : { active: true },
    orderBy: GROUP_ORDER,
    select: {
      id: true,
      nume: true,
      roles: {
        where: held ? { OR: [{ active: true }, held] } : { active: true },
        orderBy: [{ sortOrder: "asc" }, { nume: "asc" }],
        select: { id: true, nume: true, active: true },
      },
    },
  });
  return groups;
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
  /** Current roles of the first group ("Funcții"), for the Acasă card. */
  roles: string[];
}

/** The committee: persons in the record with the committee flag, those holding a function first. */
export async function committee(ctx: Ctx): Promise<CommitteeMember[]> {
  const today = toDbDate(todayIso())!;
  const persons = await ctx.db.person.findMany({
    where: { inComitet: true, dataIesire: null, statut: { not: "FOST_MEMBRU" } },
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nume: true,
      prenume: true,
      roles: {
        where: { OR: [{ until: null }, { until: { gte: today } }], role: { active: true } },
        select: { role: { select: { nume: true, sortOrder: true, group: { select: { sortOrder: true } } } } },
      },
    },
  });
  const rank = (r: { sortOrder: number; group: { sortOrder: number } }) => r.group.sortOrder * 100000 + r.sortOrder;
  return persons
    .map((p) => {
      const roles = p.roles.map((x) => x.role).sort((a, b) => rank(a) - rank(b));
      return { id: p.id, name: memberName(p), roles: roles.map((r) => r.nume), first: roles.length ? rank(roles[0]) : Infinity };
    })
    .sort((a, b) => a.first - b.first)
    .map(({ id, name, roles }) => ({ id, name, roles }));
}

/** The roles a group can be linked to: the active ones, plus those it is already linked to. By role group. */
export async function groupRoleChoices(ctx: Ctx, keep: (string | null)[]): Promise<RoleChoiceGroup[]> {
  const ids = keep.filter((x): x is string => Boolean(x));
  const roleWhere = ids.length ? { OR: [{ active: true }, { id: { in: ids } }] } : { active: true };
  const groups = await ctx.db.roleGroup.findMany({
    where: { roles: { some: roleWhere } },
    orderBy: GROUP_ORDER,
    select: { id: true, nume: true, roles: { where: roleWhere, orderBy: [{ sortOrder: "asc" }, { nume: "asc" }], select: { id: true, nume: true, active: true } } },
  });
  return groups;
}
