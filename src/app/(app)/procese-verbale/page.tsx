import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, pageParam, Pager, stringParam } from "@/components/ui/pager";
import { dateBadge } from "@/lib/format";
import { minutesNumber } from "@/lib/minutes";
import { permissions } from "@/lib/permissions";
import { listMeetings, MEETING_FILTER_LABEL, MEETING_FILTERS, type MeetingFilter } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Procese-verbale" };

export default async function MeetingsPage({ searchParams }: PageProps<"/procese-verbale">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const raw = stringParam(sp.filtru);
  const filter: MeetingFilter = (MEETING_FILTERS as readonly string[]).includes(raw) ? (raw as MeetingFilter) : "toate";
  const data = await listMeetings(ctx, pageParam(sp.pagina), filter);
  return (
    <>
      <PageHead title="Procese-verbale" sub={`${data.total} ședințe înregistrate`}>
        {permissions.write(ctx.user.role) ? (
          <Link href="/procese-verbale/import" className="btn">
            Importă
          </Link>
        ) : null}
        {permissions.write(ctx.user.role) ? (
          <Link href="/procese-verbale/nou" className="btn btn-primary">
            + Ședință nouă
          </Link>
        ) : null}
      </PageHead>
      <nav className="segs" aria-label="Filtru">
        {MEETING_FILTERS.map((f) => (
          <Link key={f} href={hrefWith("/procese-verbale", { filtru: filter === "toate" ? undefined : filter }, { filtru: f === "toate" ? null : f, pagina: null })} aria-current={filter === f ? "true" : undefined}>
            {MEETING_FILTER_LABEL[f]}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 ? (
        filter === "toate" ? (
          <EmptyState title="Nicio ședință">Începeți un proces-verbal pentru prima ședință.</EmptyState>
        ) : (
          <EmptyState title="Niciun proces-verbal">{filter === "nemarcate" ? "Toate procesele-verbale importate au semnăturile marcate." : "Nu ați importat procese-verbale."}</EmptyState>
        )
      ) : (
        <div className="list">
          {data.items.map((m) => {
            const d = dateBadge(m.data);
            return (
              <Link key={m.id} href={`/procese-verbale/${m.id}`} className="item">
                <div className="date">
                  <b>{d.day}</b>
                  <span>{d.mon}</span>
                </div>
                <div className="body">
                  <div className="t">{m.titlu || m.tip}</div>
                  <div className="m">
                    {minutesNumber(m) ?? "fără număr"} · {m.tip} · {m.prezenti} prezenți
                    {m.puncte ? ` · ${m.puncte === 1 ? "1 punct" : `${m.puncte} puncte`}` : ""}
                    {m.importat ? <span className="tag ml-1.5">Copie de evidență</span> : null}
                    {m.unmarked ? <span className="tag tag-warn ml-1.5">semnături nemarcate</span> : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <Pager pathname="/procese-verbale" params={{ filtru: filter === "toate" ? undefined : filter }} page={data.page} pages={data.pages} />
    </>
  );
}
