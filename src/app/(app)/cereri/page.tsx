import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, pageParam, Pager, stringParam } from "@/components/ui/pager";
import { formatDateTime } from "@/components/audit-trail";
import { APPLICATION_KIND_LABEL, APPLICATION_STATUS_LABEL, type ApplicationStatusKey } from "@/lib/labels";
import { memberName } from "@/lib/format";
import { listApplications } from "@/server/queries/applications";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Cereri de membru" };

const TABS: { key: string; status: ApplicationStatusKey }[] = [
  { key: "", status: "PENDING" },
  { key: "acceptate", status: "ACCEPTED" },
  { key: "respinse", status: "REJECTED" },
];

export default async function ApplicationsPage({ searchParams }: PageProps<"/cereri">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === stringParam(sp.stare)) ?? TABS[0];
  const data = await listApplications(ctx, tab.status, pageParam(sp.pagina));

  return (
    <>
      <PageHead title="Cereri de membru" sub="Trimise prin formularul online" />
      <nav className="segs" aria-label="Stare">
        {TABS.map((t) => (
          <Link key={t.status} href={hrefWith("/cereri", {}, { stare: t.key || null })} aria-current={t === tab ? "true" : undefined}>
            {APPLICATION_STATUS_LABEL[t.status]}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 ? (
        <EmptyState title="Nicio cerere aici">
          Adresa formularului și comutatorul „Primește cereri de membru online” sunt în Setări → Organizația.
        </EmptyState>
      ) : (
        <div className="list">
          {data.items.map((a) => (
            <Link key={a.id} href={`/cereri/${a.id}`} className="item">
              <div className="body">
                <div className="t">{memberName(a)}</div>
                <div className="m">
                  {APPLICATION_KIND_LABEL[a.kind]} · {formatDateTime(a.createdAt)}
                  {a.telefon ? ` · ${a.telefon}` : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pager pathname="/cereri" params={{ stare: tab.key || undefined }} page={data.page} pages={data.pages} summary={`${data.total} cereri`} />
    </>
  );
}
