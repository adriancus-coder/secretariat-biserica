import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { pageParam, Pager } from "@/components/ui/pager";
import { dateBadge } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { listMeetings } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Procese-verbale" };

export default async function MeetingsPage({ searchParams }: PageProps<"/procese-verbale">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const data = await listMeetings(ctx, pageParam(sp.pagina));
  return (
    <>
      <PageHead title="Procese-verbale" sub={`${data.total} ședințe înregistrate`}>
        {permissions.write(ctx.user.role) ? (
          <Link href="/procese-verbale/nou" className="btn btn-primary">
            + Ședință nouă
          </Link>
        ) : null}
      </PageHead>
      {data.items.length === 0 ? (
        <EmptyState title="Nicio ședință">Începeți un proces-verbal pentru prima ședință.</EmptyState>
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
                    {m.tip} · {m.prezenti} prezenți{m.areHotarari ? " · hotărâri" : ""}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <Pager pathname="/procese-verbale" params={{}} page={data.page} pages={data.pages} />
    </>
  );
}
