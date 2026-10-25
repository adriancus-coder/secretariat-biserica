import "server-only";
import { toDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { compareRo } from "@/lib/text";
import type { Prisma } from "@/generated/prisma/client";
import { ANONYMOUS_NAME } from "@/lib/anonymous";
import { writeAudit } from "./audit";
import type { Ctx, CurrentUser } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/**
 * Who counts as holding a role for a group: persons in the register (not "Fost membru", no exit
 * date, not anonymised) holding it without a past end date. Deactivated roles still count: their
 * holders stay until the role is taken from them.
 */
export function activeHoldersWhere(roleIds: string[]): Prisma.PersonWhereInput {
  return {
    statut: { not: "FOST_MEMBRU" },
    dataIesire: null,
    nume: { not: ANONYMOUS_NAME },
    roles: { some: { roleId: { in: roleIds }, OR: [{ until: null }, { until: { gte: toDbDate(todayIso())! } }] } },
  };
}

export interface SyncScope {
  /** Groups linked to any of these roles (as ministry or leader role). */
  roleIds?: readonly string[];
  /** These groups, linked or not (a group whose roles were just removed loses its AUTO members). */
  groupIds?: readonly string[];
  /** Groups whose change is already in the caller's own audit entry (the group form). */
  quietGroupIds?: readonly string[];
}

/**
 * Keeps the members of groups linked to roles in sync, in the caller's transaction: every current
 * holder of the group's ministry or leader role is an AUTO member (an existing MANUAL row of a holder
 * becomes AUTO), AUTO members who no longer hold either role are removed, MANUAL members are never
 * touched. Without a scope, every group is synced. One audit entry per group whose member list
 * changed, in the name of the user who made the triggering change. Returns the groups changed.
 */
export async function syncRoleGroups(tx: Tx, user: CurrentUser, scope: SyncScope = {}): Promise<number> {
  const roleIds = [...new Set(scope.roleIds ?? [])];
  const groupIds = [...new Set(scope.groupIds ?? [])];
  const scoped = scope.roleIds !== undefined || scope.groupIds !== undefined;
  if (scoped && !roleIds.length && !groupIds.length) return 0;
  const where: Prisma.GroupWhereInput = scoped
    ? {
        OR: [
          ...(groupIds.length ? [{ id: { in: groupIds } }] : []),
          ...(roleIds.length ? [{ functieId: { in: roleIds } }, { functieLiderId: { in: roleIds } }] : []),
        ],
      }
    : { OR: [{ functieId: { not: null } }, { functieLiderId: { not: null } }, { membri: { some: { sursa: "AUTO" } } }] };
  // Through the church-scoped client: only this church's groups; GroupMember is reached through them.
  const groups = await tx.group.findMany({
    where,
    select: {
      id: true,
      nume: true,
      functieId: true,
      functieLiderId: true,
      membri: { select: { personId: true, sursa: true, person: { select: { nume: true, prenume: true } } } },
    },
  });
  let changed = 0;
  for (const g of groups) {
    const links = [g.functieId, g.functieLiderId].filter((x): x is string => Boolean(x));
    const holders = links.length
      ? (await tx.person.findMany({ where: activeHoldersWhere(links), select: { id: true, nume: true, prenume: true } }))
      : [];
    const expected = new Map(holders.map((p) => [p.id, p]));
    const rows = new Map(g.membri.map((m) => [m.personId, m]));
    const add = holders.filter((p) => !rows.has(p.id)).map((p) => p.id);
    const toAuto = g.membri.filter((m) => m.sursa === "MANUAL" && expected.has(m.personId)).map((m) => m.personId);
    const remove = g.membri.filter((m) => m.sursa === "AUTO" && !expected.has(m.personId)).map((m) => m.personId);
    if (add.length) await tx.groupMember.createMany({ data: add.map((personId) => ({ groupId: g.id, personId, sursa: "AUTO" as const })) });
    if (toAuto.length) await tx.groupMember.updateMany({ where: { groupId: g.id, personId: { in: toAuto } }, data: { sursa: "AUTO" } });
    if (remove.length) await tx.groupMember.deleteMany({ where: { groupId: g.id, personId: { in: remove }, sursa: "AUTO" } });
    if (!add.length && !remove.length) continue;
    changed++;
    if (scope.quietGroupIds?.includes(g.id)) continue;
    const names = (list: { nume: string; prenume: string }[]) => list.map(memberName).sort(compareRo);
    const before = names(g.membri.map((m) => m.person));
    const after = names([...g.membri.filter((m) => !remove.includes(m.personId)).map((m) => m.person), ...add.map((id) => expected.get(id)!)]);
    await writeAudit(tx, user, {
      entity: "GROUP",
      entityId: g.id,
      entityLabel: g.nume,
      action: "UPDATE",
      fields: ["membri"],
      before: { membri: before },
      after: { membri: after },
      extra: { sursa: "actualizat din funcții" },
    });
  }
  return changed;
}
