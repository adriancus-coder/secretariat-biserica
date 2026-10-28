"use server";

import { z } from "zod";
import { searchData, searchPageGroup, type SearchGroup } from "../global-search";
import { sharedRateLimiter } from "../rate-limit";
import { actionCtx, ActionError } from "../session";

/** At most 60 searches a minute per user (in memory). */
const limiter = sharedRateLimiter("global-search", { limit: 60, windowMs: 60_000 });
const querySchema = z.string().max(100);

export interface SearchResponse {
  groups: SearchGroup[];
  message?: string;
}

/**
 * GLOBAL-SEARCH, as the user types: the pages and settings he may open, then the church's data (every
 * group needs `read`, so the Rugăciune role gets its pages only), at most 5 per group with the totals.
 * The query is never logged or audited (it may hold a name).
 */
export async function globalSearchAction(q: string): Promise<SearchResponse> {
  try {
    const ctx = await actionCtx("account");
    const query = querySchema.safeParse(q);
    if (!query.success) return { groups: [] };
    if (!limiter.hit(ctx.user.id)) return { groups: [], message: "Prea multe căutări într-un minut. Încercați din nou puțin mai târziu." };
    const pages = searchPageGroup(ctx, query.data, 5);
    return { groups: [...(pages ? [pages] : []), ...(await searchData(ctx, query.data, 5))] };
  } catch (e) {
    return { groups: [], message: e instanceof ActionError ? e.message : "Căutarea nu a reușit. Încercați din nou." };
  }
}
