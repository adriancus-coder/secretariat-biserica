import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { hrefWith, pageParam, Pager, stringParam } from "@/components/ui/pager";
import { formatDateTime } from "@/components/audit-trail";
import { APPLICATION_KIND_LABEL, APPLICATION_STATUS_LABEL, PERSON_PROPOSAL_LABEL, PROPOSAL_STATUS_LABEL, type ApplicationStatusKey } from "@/lib/labels";
import { memberName } from "@/lib/format";
import { listApplications, listPersonProposals } from "@/server/queries/applications";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Cereri de membru" };

const TABS: { key: string; status: ApplicationStatusKey; label?: string }[] = [
  { key: "", status: "PENDING" },
  { key: "propuse", status: "PROPUSA", label: "La pastor" },
  { key: "acceptate", status: "ACCEPTED" },
  { key: "respinse", status: "REJECTED" },
];

export default async function ApplicationsPage({ searchParams }: PageProps<"/cereri">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === stringParam(sp.stare)) ?? TABS[0];
  const data = await listApplications(ctx, tab.status, pageParam(sp.pagina));
  // Reabilitări and excluderi waiting for the pastor, or decided by them, next to the applications.
  const proposals = tab.status === "PROPUSA" || tab.status === "REJECTED" ? await listPersonProposals(ctx, tab.status) : [];

  return (
    <>
      <PageHead title="Cereri de membru" sub="Trimise prin formularul online" />
      <nav className="segs" aria-label="Stare">
        {TABS.map((t) => (
          <Link key={t.status} href={hrefWith("/cereri", {}, { stare: t.key || null })} aria-current={t === tab ? "true" : undefined}>
            {t.label ?? APPLICATION_STATUS_LABEL[t.status]}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 && proposals.length ? null : data.items.length === 0 ? (
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
      {proposals.length ? (
        <>
          <h3 className="mt-4">Reabilitări și excluderi</h3>
          <div className="list">
            {proposals.map((p) => (
              <Link key={p.id} href={`/cereri/propuneri/${p.id}`} className="item">
                <div className="body">
                  <div className="t">{p.nume}</div>
                  <div className="m">
                    {PERSON_PROPOSAL_LABEL[p.kind]} · {formatDateTime(p.createdAt)}
                    {p.motivRespingere ? ` · ${p.motivRespingere}` : ""}
                  </div>
                </div>
                <span className={`tag ${p.kind === "EXCLUDERE" ? "tag-warn" : "tag-gold"}`}>{PROPOSAL_STATUS_LABEL[tab.status === "PROPUSA" ? "PROPUSA" : "REJECTED"]}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
      <Pager pathname="/cereri" params={{ stare: tab.key || undefined }} page={data.page} pages={data.pages} summary={`${data.total} cereri`} />
    </>
  );
}
