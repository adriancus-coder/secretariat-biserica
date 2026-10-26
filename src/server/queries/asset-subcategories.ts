import "server-only";
import type { Subcategory } from "@/lib/asset-subcategories";
import type { Ctx } from "../session";

/** PATRIMONY-SUBCATEGORIES: every subcategory of the church, in each category's order. */
export async function listSubcategories(db: Ctx["db"]): Promise<Subcategory[]> {
  return db.assetSubcategory.findMany({ orderBy: [{ categorie: "asc" }, { ordine: "asc" }, { nume: "asc" }], select: { id: true, categorie: true, nume: true, ordine: true } });
}

/** The same, with the number of goods (in use or not) filed under each one, for Setări. */
export async function listSubcategoriesWithUse(db: Ctx["db"]): Promise<(Subcategory & { used: number })[]> {
  const rows = await db.assetSubcategory.findMany({
    orderBy: [{ categorie: "asc" }, { ordine: "asc" }, { nume: "asc" }],
    select: { id: true, categorie: true, nume: true, ordine: true, _count: { select: { assets: true } } },
  });
  return rows.map(({ _count, ...s }) => ({ ...s, used: _count.assets }));
}
