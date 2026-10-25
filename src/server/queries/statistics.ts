import "server-only";
import { byMonth, evolution, structure, type MonthRow, type Structure, type YearRow } from "@/domain/evolution";
import { reportYears } from "@/domain/stats";
import { todayIso } from "@/lib/dates";
import type { Ctx } from "../session";
import { loadCategoryInput } from "./categories";

export interface StatisticsData {
  today: string;
  /** The selected year. */
  year: number;
  /** The year as the categories take it (undefined = today, for the current year). */
  an: number | undefined;
  years: number[];
  rows: YearRow[];
  months: MonthRow[];
  structure: Structure;
}

/** The "Statistici" page: ten years ending with the selected one, its months, and the structure at its end. */
export async function loadStatistics(ctx: Ctx, requested?: number): Promise<StatisticsData> {
  const input = await loadCategoryInput(ctx);
  const today = todayIso();
  const current = Number(today.slice(0, 4));
  const year = requested && requested <= current ? requested : current;
  const an = year === current ? undefined : year;
  return {
    today,
    year,
    an,
    years: reportYears(input.persons, current),
    rows: evolution(input, year, 10),
    months: byMonth(input.persons, year),
    structure: structure({ ...input, year: an }),
  };
}
