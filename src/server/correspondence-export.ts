import "server-only";
import { DIRECTION_FILTERS, filterRows, type DirectionFilter } from "@/lib/correspondence";
import { todayIso } from "@/lib/dates";
import { correspondenceYears, loadRegister } from "./queries/correspondence";
import type { Ctx } from "./session";

/** The export's rows: the year, the direction filter and the search of the page (`an`, `filtru`, `q`). */
export async function exportRegister(ctx: Ctx, sp: URLSearchParams) {
  const current = Number(todayIso().slice(0, 4));
  const years = await correspondenceYears(ctx, current);
  const an = years.includes(Number(sp.get("an"))) ? Number(sp.get("an")) : current;
  const raw = sp.get("filtru") ?? "";
  const filter: DirectionFilter = (DIRECTION_FILTERS as readonly string[]).includes(raw) ? (raw as DirectionFilter) : "toate";
  const rows = filterRows(await loadRegister(ctx, an), filter, (sp.get("q") ?? "").slice(0, 100));
  return { an, rows };
}
