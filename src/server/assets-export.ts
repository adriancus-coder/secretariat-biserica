import "server-only";
import { ASSET_FILTERS, filterAssets, type AssetFilter } from "@/lib/patrimony";
import { loadAssets } from "./queries/assets";
import type { Ctx } from "./session";

/** The export's goods: the page's filter (default „În uz”), category, subcategory and search (`filtru`, `categorie`, `sub`, `q`). */
export async function exportAssets(ctx: Ctx, sp: URLSearchParams) {
  const raw = sp.get("filtru") ?? "";
  const filter: AssetFilter = (ASSET_FILTERS as readonly string[]).includes(raw) ? (raw as AssetFilter) : "in-uz";
  return filterAssets(await loadAssets(ctx), filter, (sp.get("categorie") ?? "").slice(0, 80), (sp.get("q") ?? "").slice(0, 100), (sp.get("sub") ?? "").slice(0, 40));
}
