import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { pageParam, Pager, stringParam } from "@/components/ui/pager";
import { SearchBox } from "@/components/ui/search-box";
import { dateBadge, memberName } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { listNotes } from "@/server/queries/groups-notes";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Mențiuni" };

export default async function NotesPage({ searchParams }: PageProps<"/mentiuni">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const q = stringParam(sp.q).slice(0, 100);
  const persoana = stringParam(sp.persoana) || null;
  const data = await listNotes(ctx, { q, personId: persoana, page: pageParam(sp.pagina) });
  const person = persoana ? await ctx.db.person.findUnique({ where: { id: persoana }, select: { nume: true, prenume: true } }) : null;

  return (
    <>
      <PageHead title="Mențiuni" sub={person ? `Pentru ${memberName(person)}` : "Note pe persoane și familii"}>
        {permissions.write(ctx.user.role) ? (
          <Link href={persoana ? `/mentiuni/nou?persoana=${persoana}` : "/mentiuni/nou"} className="btn btn-primary">
            + Mențiune
          </Link>
        ) : null}
      </PageHead>
      <div className="toolbar">
        <Suspense>
          <SearchBox placeholder="Caută" />
        </Suspense>
        {persoana ? (
          <Link href="/mentiuni" className="btn btn-sm self-center">
            Toate mențiunile
          </Link>
        ) : null}
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="Nicio mențiune">{data.anyNote ? "Schimbați căutarea." : null}</EmptyState>
      ) : (
        <div className="list">
          {data.items.map((n) => {
            const d = dateBadge(n.data);
            return (
              <Link key={n.id} href={`/mentiuni/${n.id}`} className="item">
                <div className="date">
                  <b>{d.day}</b>
                  <span>{d.mon}</span>
                </div>
                <div className="body">
                  <div className="t">{n.who}</div>
                  <div className="m">{n.text}</div>
                </div>
                <span className="tag">{n.tip}</span>
              </Link>
            );
          })}
        </div>
      )}
      <Pager
        pathname="/mentiuni"
        params={{ q: q || undefined, persoana: persoana ?? undefined }}
        page={data.page}
        pages={data.pages}
        summary={`${data.total} mențiuni`}
      />
    </>
  );
}
