import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { DIRECTION_LABEL } from "@/lib/correspondence";
import { fmt, memberName } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { deleteCorrespondenceAction } from "@/server/actions/correspondence";
import { getCorrespondence } from "@/server/queries/correspondence";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Corespondență" };

/** One entry or exit of the register, its links, and "Răspunde" on an entry (write roles). */
export default async function CorrespondencePage({ params }: PageProps<"/corespondenta/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const r = await getCorrespondence(ctx, id);
  if (!r) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "CORRESPONDENCE", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];
  const entry = r.directie === "INTRARE";
  return (
    <>
      <BackLink href={`/corespondenta?an=${r.an}`}>Corespondență</BackLink>
      <PageHead title={`${DIRECTION_LABEL[r.directie]} nr. ${r.nr}/${r.an}`} sub={r.subiect}>
        {canWrite && entry ? (
          <Link href={`/corespondenta/nou?raspunsLa=${r.id}`} className="btn btn-primary">
            Răspunde
          </Link>
        ) : null}
        {canWrite && entry ? (
          <Link href={`/documente/nou?tip=scrisoare&raspunsLa=${r.id}`} className="btn">
            Scrie scrisoarea de răspuns
          </Link>
        ) : null}
        {canWrite ? (
          <Link href={`/corespondenta/${r.id}/editare`} className="btn">
            Editează
          </Link>
        ) : null}
      </PageHead>
      <dl className="detail mb-4">
        <dt>Data</dt>
        <dd>{fmt(r.data)}</dd>
        <dt>{entry ? "De la" : "Către"}</dt>
        <dd>{entry ? r.dela : r.catre}</dd>
        <dt>Subiect</dt>
        <dd>{r.subiect}</dd>
        <dt>Rezolvare</dt>
        <dd>{r.rezolvare || "—"}</dd>
        {r.document ? (
          <>
            <dt>Document emis</dt>
            <dd>
              <Link href={`/documente/${r.document.id}`}>
                Nr. {r.document.nr}/{r.document.anRegistru} — {r.document.titlu || DOCUMENT_TYPE_LABEL[r.document.tip]}
              </Link>
            </dd>
          </>
        ) : null}
        {r.raspunsLa ? (
          <>
            <dt>Răspuns la</dt>
            <dd>
              <Link href={`/corespondenta/${r.raspunsLa.id}`}>
                Intrarea nr. {r.raspunsLa.nr}/{r.raspunsLa.an} — {r.raspunsLa.subiect}
              </Link>
            </dd>
          </>
        ) : null}
        {r.raspunsuri.length ? (
          <>
            <dt>Răspunsuri</dt>
            <dd>
              {r.raspunsuri.map((x) => (
                <Link key={x.id} href={`/corespondenta/${x.id}`} className="block">
                  Ieșirea nr. {x.nr}/{x.an} — {x.subiect}
                </Link>
              ))}
            </dd>
          </>
        ) : null}
        {r.person ? (
          <>
            <dt>Persoana</dt>
            <dd>
              <Link href={`/persoane/${r.person.id}`}>{memberName(r.person)}</Link>
            </dd>
          </>
        ) : null}
      </dl>
      {audit.length ? (
        <div className="card">
          <h3>Istoric modificări</h3>
          <AuditTrail rows={audit} />
        </div>
      ) : null}
      {canWrite ? (
        <div className="actions">
          <DeleteButton action={deleteCorrespondenceAction.bind(null, r.id)} confirmMessage="Ștergeți înregistrarea? Numărul ei rămâne neocupat." />
        </div>
      ) : null}
    </>
  );
}
