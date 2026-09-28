import "server-only";
import { buildReportText, type YearActivity } from "@/domain/report";
import { computeStats, reportYears, type Stats } from "@/domain/stats";
import type { PersonRecord } from "@/domain/types";
import { todayIso, toDbDate } from "@/lib/dates";
import { EVENT_TYPE_FUNERAL, EVENT_TYPE_WEDDING } from "@/lib/labels";
import { personRecordSelect, toEventRecord, toPersonRecord } from "../mappers";
import type { Ctx } from "../session";

/** Toate persoanele din registru, în ordine alfabetică românească. */
export async function loadPersonRecords(ctx: Ctx): Promise<PersonRecord[]> {
  const rows = await ctx.db.person.findMany({
    select: personRecordSelect,
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
  });
  return rows.map(toPersonRecord);
}

/** Evenimentele relevante pentru statistici (nunți și înmormântări). */
async function loadStatEvents(ctx: Ctx) {
  const rows = await ctx.db.event.findMany({
    where: { tip: { in: [EVENT_TYPE_WEDDING, EVENT_TYPE_FUNERAL] } },
    select: { id: true, titlu: true, tip: true, data: true },
    orderBy: [{ data: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toEventRecord);
}

export async function yearActivity(ctx: Ctx, year: number): Promise<YearActivity> {
  const range = { gte: toDbDate(`${year}-01-01`)!, lte: toDbDate(`${year}-12-31`)! };
  const [evenimente, sedinte, documente] = await Promise.all([
    ctx.db.event.count({ where: { data: range } }),
    ctx.db.meeting.count({ where: { data: range } }),
    ctx.db.document.count({ where: { data: range, tip: { not: "raport" } } }),
  ]);
  return { evenimente, sedinte, documente };
}

export interface StatsBundle {
  stats: Stats;
  persons: PersonRecord[];
  years: number[];
  today: string;
}

/** Statistica pentru tabloul de bord: `year` lipsă = situația la zi. */
export async function loadStats(ctx: Ctx, year?: number): Promise<StatsBundle> {
  const today = todayIso();
  const [persons, events] = await Promise.all([loadPersonRecords(ctx), loadStatEvents(ctx)]);
  const stats = computeStats(persons, events, { year, today });
  return { stats, persons, years: reportYears(persons, Number(today.slice(0, 4))), today };
}

/** Textul dării de seamă pentru anul dat. */
export async function generateReportText(ctx: Ctx, year: number): Promise<string> {
  const today = todayIso();
  const [persons, events, activity] = await Promise.all([loadPersonRecords(ctx), loadStatEvents(ctx), yearActivity(ctx, year)]);
  return buildReportText(year, computeStats(persons, events, { year, today }), activity);
}
