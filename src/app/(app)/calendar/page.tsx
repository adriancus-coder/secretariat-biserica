import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, pageParam, Pager, stringParam } from "@/components/ui/pager";
import { addMonths, daysInMonth, isIsoDate, isoFromParts, todayIso, weekdayMondayFirst } from "@/lib/dates";
import { capitalize, fmt, MONTHS_L } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { listEvents, monthEntries } from "@/server/queries/events";
import { requireCtx } from "@/server/session";
import { EventRow } from "./event-row";

export const metadata: Metadata = { title: "Calendar" };

const VIEWS = [
  ["luna", "Lună"],
  ["viitoare", "Viitoare"],
  ["trecute", "Trecute"],
] as const;
type View = (typeof VIEWS)[number][0];

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const view: View = (["viitoare", "trecute"] as const).find((v) => v === stringParam(sp.vedere)) ?? "luna";
  const today = todayIso();
  const canWrite = permissions.write(ctx.user.role);

  return (
    <>
      <PageHead title="Calendar" sub="Servicii, evanghelizări, agape, ședințe">
        {canWrite ? (
          <Link href="/calendar/nou" className="btn btn-primary">
            + Eveniment
          </Link>
        ) : null}
      </PageHead>
      <nav className="segs" aria-label="Vedere">
        {VIEWS.map(([k, l]) => (
          <Link key={k} href={k === "luna" ? "/calendar" : `/calendar?vedere=${k}`} aria-current={view === k ? "true" : undefined}>
            {l}
          </Link>
        ))}
      </nav>
      {view === "luna" ? (
        <MonthView sp={sp} today={today} canWrite={canWrite} ctx={ctx} />
      ) : (
        <ListView view={view} page={pageParam(sp.pagina)} today={today} ctx={ctx} />
      )}
    </>
  );
}

async function ListView({ view, page, today, ctx }: { view: "viitoare" | "trecute"; page: number; today: string; ctx: Awaited<ReturnType<typeof requireCtx>> }) {
  const data = await listEvents(ctx, view, today, page);
  if (!data.items.length) return <EmptyState title={view === "viitoare" ? "Nimic programat" : "Niciun eveniment trecut"} />;
  return (
    <>
      <div className="list">
        {data.items.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </div>
      <Pager pathname="/calendar" params={{ vedere: view }} page={data.page} pages={data.pages} summary={`${data.total} evenimente`} />
    </>
  );
}

async function MonthView({
  sp,
  today,
  canWrite,
  ctx,
}: {
  sp: Record<string, string | string[] | undefined>;
  today: string;
  canWrite: boolean;
  ctx: Awaited<ReturnType<typeof requireCtx>>;
}) {
  const monthParam = stringParam(sp.luna);
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam);
  const year = valid ? Number(monthParam.slice(0, 4)) : Number(today.slice(0, 4));
  const month0 = valid ? Number(monthParam.slice(5, 7)) - 1 : Number(today.slice(5, 7)) - 1;
  const dim = daysInMonth(year, month0);
  const monthKey = isoFromParts(year, month0, 1).slice(0, 7);
  const zi = stringParam(sp.zi);
  const selected = isIsoDate(zi) ? zi : today.startsWith(monthKey) ? today : `${monthKey}-01`;
  const byDay = await monthEntries(ctx, year, month0);
  const start = weekdayMondayFirst(year, month0, 1);
  const prev = addMonths(year, month0, -1);
  const next = addMonths(year, month0, 1);
  const monthHref = (y: number, m0: number) => `/calendar?luna=${isoFromParts(y, m0, 1).slice(0, 7)}`;
  const dayEntries = selected.startsWith(monthKey) ? (byDay.get(selected) ?? []) : [];

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <Link href={monthHref(prev.year, prev.month0)} className="btn btn-sm btn-ghost" aria-label="Luna anterioară">
          ‹
        </Link>
        <h3 className="text-lg">
          {capitalize(MONTHS_L[month0])} {year}
        </h3>
        <Link href={monthHref(next.year, next.month0)} className="btn btn-sm btn-ghost" aria-label="Luna următoare">
          ›
        </Link>
      </div>
      <div className="cal" role="grid" aria-label={`${MONTHS_L[month0]} ${year}`}>
        {["L", "Ma", "Mi", "J", "V", "S", "D"].map((w) => (
          <div key={w} className="wd" role="columnheader">
            {w}
          </div>
        ))}
        {Array.from({ length: start }, (_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: dim }, (_, i) => {
          const d = i + 1;
          const ds = isoFromParts(year, month0, d);
          const n = byDay.get(ds)?.length ?? 0;
          return (
            <Link
              key={ds}
              href={hrefWith("/calendar", { luna: monthKey }, { zi: ds })}
              scroll={false}
              className={`d ${ds === today ? "today" : ""} ${ds === selected ? "sel" : ""}`}
              aria-label={`${d} ${MONTHS_L[month0]}${n ? `, ${n} în program` : ""}`}
              aria-current={ds === selected ? "date" : undefined}
            >
              {d}
              {n ? (
                <i>
                  {Array.from({ length: Math.min(3, n) }, (_, k) => (
                    <b key={k} />
                  ))}
                </i>
              ) : null}
            </Link>
          );
        })}
      </div>
      <div className="letter flex items-center gap-2">
        {fmt(selected)}
        {canWrite ? (
          <>
            <Link href={`/calendar/nou?data=${selected}`} className="btn btn-sm btn-ghost">
              + eveniment
            </Link>
            <Link href={`/procese-verbale/nou?data=${selected}`} className="btn btn-sm btn-ghost">
              + ședință
            </Link>
          </>
        ) : null}
      </div>
      <div className="list">
        {dayEntries.length ? (
          dayEntries.map((e) =>
            e.kind === "meeting" ? (
              <Link key={e.id} href={`/procese-verbale/${e.id}`} className="item">
                <div className="body">
                  <div className="t">{e.titlu || e.tip}</div>
                  <div className="m">Ședință{e.ora ? ` · ${e.ora}` : ""}</div>
                </div>
                <span className="tag">PV</span>
              </Link>
            ) : (
              <EventRow key={e.id} e={e.item!} />
            ),
          )
        ) : (
          <div className="hint px-1 py-3">Nimic în această zi.</div>
        )}
      </div>
    </>
  );
}
