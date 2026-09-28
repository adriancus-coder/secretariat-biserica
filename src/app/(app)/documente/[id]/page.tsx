import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fmt } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { deleteDocumentAction } from "@/server/actions/documents";
import { getDocument } from "@/server/queries/documents";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: PageProps<"/documente/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const x = await getDocument(ctx, id);
  if (!x) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "DOCUMENT", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];

  return (
    <>
      <BackLink href="/documente">Documente</BackLink>
      <PageHead title={x.titlu || DOCUMENT_TYPE_LABEL[x.tip]} sub={DOCUMENT_TYPE_LABEL[x.tip]}>
        <a href={`/pdf/document/${x.id}`} target="_blank" rel="noopener" className="btn">
          Tipărește (PDF)
        </a>
        {canWrite ? (
          <Link href={`/documente/${x.id}/editare`} className="btn btn-primary">
            Editează
          </Link>
        ) : null}
      </PageHead>
      <dl className="detail mb-4">
        <dt>Număr / dată</dt>
        <dd>
          Nr. {x.nr} din {fmt(x.data)} <span className="hint inline">(registrul {x.anRegistru})</span>
        </dd>
        {x.persoana ? (
          <>
            <dt>Persoana</dt>
            <dd>{x.personId ? <Link href={`/persoane/${x.personId}`}>{x.persoana}</Link> : x.persoana}</dd>
          </>
        ) : null}
        {x.catre ? (
          <>
            <dt>Către</dt>
            <dd>{x.catre}</dd>
          </>
        ) : null}
        {x.anRaport ? (
          <>
            <dt>Anul raportat</dt>
            <dd>{x.anRaport}</dd>
          </>
        ) : null}
        <dt>Conținut</dt>
        <dd className="whitespace-pre-wrap font-serif card !mt-1">{x.text}</dd>
      </dl>
      {audit.length ? (
        <div className="card">
          <h3>Istoric modificări</h3>
          <AuditTrail rows={audit} />
        </div>
      ) : null}
      {canWrite ? (
        <div className="actions">
          <DeleteButton action={deleteDocumentAction.bind(null, x.id)} confirmMessage="Ștergeți documentul din registru?" />
        </div>
      ) : null}
    </>
  );
}
