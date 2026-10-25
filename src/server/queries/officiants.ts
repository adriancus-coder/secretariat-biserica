import "server-only";
import { highestOrdination, type OfficiantOption } from "@/lib/officiants";
import { compareRo } from "@/lib/text";
import { activeHoldersWhere } from "../group-sync";
import type { Ctx } from "../session";

/** Persons holding an ordained role now (Statut art. 30), with their highest ordination: the officiant picker. */
export async function officiantOptions(ctx: Ctx): Promise<OfficiantOption[]> {
  const roles = await ctx.db.churchRole.findMany({ where: { ordinat: { not: null } }, select: { id: true, ordinat: true } });
  if (!roles.length) return [];
  const ordination = new Map(roles.map((r) => [r.id, r.ordinat]));
  const people = await ctx.db.person.findMany({
    where: activeHoldersWhere([...ordination.keys()]),
    select: { nume: true, prenume: true, roles: { select: { roleId: true } } },
  });
  return people
    .map((p) => ({ name: `${p.prenume} ${p.nume}`.trim(), ordinat: highestOrdination(p.roles.map((r) => ordination.get(r.roleId) ?? null))! }))
    .filter((o) => o.ordinat)
    .sort((a, b) => compareRo(a.name, b.name));
}
