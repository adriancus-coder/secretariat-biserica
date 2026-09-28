import "server-only";
import { daysInMonth, fromDbDate, isoFromParts, toDbDate } from "@/lib/dates";
import type { Ctx } from "../session";

export const EVENTS_PAGE_SIZE = 30;

const listSelect = {
  id: true,
  titlu: true,
  tip: true,
  data: true,
  ora: true,
  loc: true,
  invitat: true,
  agapaActiva: true,
  _count: { select: { contributii: true } },
} as const;

export interface EventListItem {
  id: string;
  titlu: string;
  tip: string;
  data: string;
  ora: string;
  loc: string;
  invitat: string;
  agapaActiva: boolean;
  contributii: number;
}

type Row = {
  id: string;
  titlu: string;
  tip: string;
  data: Date;
  ora: string;
  loc: string;
  invitat: string;
  agapaActiva: boolean;
  _count: { contributii: number };
};

function toItem(e: Row): EventListItem {
  return { ...e, data: fromDbDate(e.data)!, contributii: e._count.contributii };
}

/** Evenimentele viitoare (de azi încolo, crescător) sau trecute (descrescător), paginat. */
export async function listEvents(ctx: Ctx, when: "viitoare" | "trecute", today: string, page: number) {
  const where = when === "viitoare" ? { data: { gte: toDbDate(today)! } } : { data: { lt: toDbDate(today)! } };
  const total = await ctx.db.event.count({ where });
  const pages = Math.max(1, Math.ceil(total / EVENTS_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const dir = when === "viitoare" ? "asc" : "desc";
  const rows = await ctx.db.event.findMany({
    where,
    orderBy: [{ data: dir }, { ora: dir }, { createdAt: dir }],
    skip: (current - 1) * EVENTS_PAGE_SIZE,
    take: EVENTS_PAGE_SIZE,
    select: listSelect,
  });
  return { items: rows.map(toItem), total, page: current, pages };
}

export interface MonthEntry {
  kind: "event" | "meeting";
  id: string;
  titlu: string;
  tip: string;
  data: string;
  ora: string;
  item?: EventListItem;
}

/** Evenimentele și ședințele unei luni, grupate pe zile (pentru vederea lunară). */
export async function monthEntries(ctx: Ctx, year: number, month0: number): Promise<Map<string, MonthEntry[]>> {
  const from = toDbDate(isoFromParts(year, month0, 1))!;
  const to = toDbDate(isoFromParts(year, month0, daysInMonth(year, month0)))!;
  const [events, meetings] = await Promise.all([
    ctx.db.event.findMany({ where: { data: { gte: from, lte: to } }, orderBy: [{ data: "asc" }, { ora: "asc" }], select: listSelect }),
    ctx.db.meeting.findMany({
      where: { data: { gte: from, lte: to } },
      orderBy: [{ data: "asc" }, { ora: "asc" }],
      select: { id: true, titlu: true, tip: true, data: true, ora: true },
    }),
  ]);
  const byDay = new Map<string, MonthEntry[]>();
  const push = (e: MonthEntry) => {
    const list = byDay.get(e.data) ?? [];
    list.push(e);
    byDay.set(e.data, list);
  };
  for (const e of events) {
    const item = toItem(e);
    push({ kind: "event", id: e.id, titlu: e.titlu, tip: e.tip, data: item.data, ora: e.ora, item });
  }
  for (const m of meetings) push({ kind: "meeting", id: m.id, titlu: m.titlu, tip: m.tip, data: fromDbDate(m.data)!, ora: m.ora });
  return byDay;
}

export async function getEvent(ctx: Ctx, id: string) {
  const e = await ctx.db.event.findUnique({
    where: { id },
    include: { contributii: { orderBy: { pozitie: "asc" }, select: { cine: true, ce: true } } },
  });
  if (!e) return null;
  return { ...e, data: fromDbDate(e.data)! };
}
