import "server-only";
import { loadConsentStates } from "../consents";
import { categoryContext, combineCategories, type CategoryContext, type CategoryInput, type CombineMode } from "@/domain/categories";
import type { PersonRecord } from "@/domain/types";
import { todayIso, toDbDate } from "@/lib/dates";
import type { CategorySelection } from "@/lib/category-params";
import type { Ctx } from "../session";
import { loadPersonRecords, loadStatEvents } from "./stats";
import { filterGenderAge, isGenderAgeActive, type GenderAge } from "@/domain/categories";

export interface LoadedCategories {
  ctx: CategoryContext;
  persons: PersonRecord[];
}

/** Everything the categories need, for any year. */
export async function loadCategoryInput(ctx: Ctx): Promise<Omit<CategoryInput, "year">> {
  const today = todayIso();
  const [persons, events, committee, families, roles, consents] = await Promise.all([
    loadPersonRecords(ctx),
    loadStatEvents(ctx),
    ctx.db.person.findMany({ where: { inComitet: true }, select: { id: true } }),
    ctx.db.family.findMany({ where: { headId: { not: null } }, select: { headId: true } }),
    // Current roles (no past end date), through the persons of this church.
    ctx.db.person.findMany({
      where: { roles: { some: {} } },
      select: { id: true, roles: { where: { OR: [{ until: null }, { until: { gte: toDbDate(today)! } }] }, select: { roleId: true } } },
    }),
    loadConsentStates(ctx),
  ]);
  const holders = new Map<string, Set<string>>();
  for (const p of roles) for (const r of p.roles) holders.set(r.roleId, (holders.get(r.roleId) ?? new Set()).add(p.id));
  return { persons, events, today, committee: new Set(committee.map((p) => p.id)), heads: new Set(families.map((f) => f.headId!)), holders, consents };
}

/** The categories for the selected year (undefined = today, as on Acasă). */
export async function loadCategories(ctx: Ctx, year?: number): Promise<LoadedCategories> {
  const input = await loadCategoryInput(ctx);
  return { persons: input.persons, ctx: categoryContext({ ...input, year }) };
}

/**
 * GENDER-AGE-FILTERS: the ids of a selection, then only those of the chosen gender and age at the
 * selection's reference date (the export and its count follow the list's filters).
 */
export async function filteredSelectionIds(ctx: Ctx, sel: CategorySelection, mode: CombineMode | undefined, ga: GenderAge): Promise<string[]> {
  const loaded = await loadCategories(ctx, sel.year);
  const ids = combineCategories(loaded.ctx, loaded.persons, sel.keys, mode ?? sel.mode ?? "oricare", sel.functie);
  if (!isGenderAgeActive(ga)) return ids;
  const keep = new Set(ids);
  return filterGenderAge(loaded.persons.filter((p) => keep.has(p.id)), ga, loaded.ctx.stats.endDate).map((p) => p.id);
}

/** The ids of a selection of categories, in register order. */
export async function selectionIds(ctx: Ctx, sel: CategorySelection, mode?: CombineMode): Promise<string[]> {
  const loaded = await loadCategories(ctx, sel.year);
  return combineCategories(loaded.ctx, loaded.persons, sel.keys, mode ?? sel.mode ?? "oricare", sel.functie);
}
