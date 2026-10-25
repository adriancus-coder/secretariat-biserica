import "server-only";
import { categoryContext, combineCategories, type CategoryContext, type CombineMode } from "@/domain/categories";
import type { PersonRecord } from "@/domain/types";
import { todayIso, toDbDate } from "@/lib/dates";
import type { CategorySelection } from "@/lib/category-params";
import type { Ctx } from "../session";
import { loadPersonRecords, loadStatEvents } from "./stats";

export interface LoadedCategories {
  ctx: CategoryContext;
  persons: PersonRecord[];
}

/** Everything the categories need, for the selected year (undefined = today, as on Acasă). */
export async function loadCategories(ctx: Ctx, year?: number): Promise<LoadedCategories> {
  const today = todayIso();
  const [persons, events, committee, families, roles] = await Promise.all([
    loadPersonRecords(ctx),
    loadStatEvents(ctx),
    ctx.db.person.findMany({ where: { inComitet: true }, select: { id: true } }),
    ctx.db.family.findMany({ where: { headId: { not: null } }, select: { headId: true } }),
    // Current roles (no past end date), through the persons of this church.
    ctx.db.person.findMany({
      where: { roles: { some: {} } },
      select: { id: true, roles: { where: { OR: [{ until: null }, { until: { gte: toDbDate(today)! } }] }, select: { roleId: true } } },
    }),
  ]);
  const holders = new Map<string, Set<string>>();
  for (const p of roles) for (const r of p.roles) holders.set(r.roleId, (holders.get(r.roleId) ?? new Set()).add(p.id));
  return {
    persons,
    ctx: categoryContext({
      persons,
      events,
      today,
      year,
      committee: new Set(committee.map((p) => p.id)),
      heads: new Set(families.map((f) => f.headId!)),
      holders,
    }),
  };
}

/** The ids of a selection of categories, in register order. */
export async function selectionIds(ctx: Ctx, sel: CategorySelection, mode: CombineMode = "oricare"): Promise<string[]> {
  const loaded = await loadCategories(ctx, sel.year);
  return combineCategories(loaded.ctx, loaded.persons, sel.keys, mode, sel.functie);
}
