import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { RichView } from "@/components/rich-editor/rich-view";
import { StatLinks } from "@/components/stat-links";
import { loadCategories } from "@/server/queries/categories";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fmt } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { deleteDocumentAction } from "@/server/actions/documents";
import { getDocument } from "@/server/queries/documents";
import { requireCtx } from "@/server/session";
import { prisma } from "@/server/db";
import { freshSignatureRequired, signatureNote } from "@/lib/signatures";
import { signDocumentAction } from "@/server/actions/document-signatures";
import { SignaturesCard } from "./signatures-card";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: PageProps<"/documente/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const x = await getDocument(ctx, id);
  if (!x) notFound();
  const canWrite = permissions.write(ctx.user.role);
  // A dare de seamă: its year's figures as links to the persons behind them.
  const reportCats = x.tip === "raport" && x.anRaport ? await loadCategories(ctx, x.anRaport) : null;
  // Signatures (reached through the document found above with the church-scoped client).
  const [sigRows, me, church, passkeys] = await Promise.all([
    prisma.documentSignature.findMany({ where: { documentId: x.id } }),
    prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { signatureSavedAt: true } }),
    prisma.church.findUniqueOrThrow({ where: { id: ctx.user.churchId }, select: { semnaturaUnica: true, semnaturaUnicaTipuri: true } }),
    prisma.userPasskey.count({ where: { userId: ctx.user.id } }),
  ]);
  const signatures = Object.fromEntries(
    sigRows.map((r) => [r.role, { name: r.name, image: `data:image/png;base64,${Buffer.from(r.imagePng).toString("base64")}`, note: signatureNote(r) }]),
  );
  const steps = [
    ...(permissions.pastor(ctx.user) ? [{ role: "PASTOR" as const, label: "Semnează ca pastor", sign: signDocumentAction.bind(null, x.id, "PASTOR") }] : []),
    ...(canWrite ? [{ role: "SECRETAR" as const, label: "Semnează ca secretar", sign: signDocumentAction.bind(null, x.id, "SECRETAR") }] : []),
  ];
  const savedHint = !passkeys
    ? "Activați Face ID / amprenta în Cont → Securitate."
    : !me.signatureSavedAt
      ? "Salvați întâi o semnătură în Cont → Semnătura mea."
      : null;
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
        <a href={`/pdf/document/${x.id}/word`} className="btn" download>
          Deschide în Word
        </a>
        {canWrite ? (
          <Link href={`/documente/${x.id}/asezare`} className="btn">
            Așezare în pagină
          </Link>
        ) : null}
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
        {x.textRich ? (
          <dd className="card !mt-1">
            <RichView doc={x.textRich} />
          </dd>
        ) : (
          <dd className="whitespace-pre-wrap font-serif card !mt-1">{x.text}</dd>
        )}
      </dl>
      <SignaturesCard
        documentId={x.id}
        me={ctx.user.name}
        signatures={signatures}
        steps={steps}
        canUseSaved={passkeys > 0 && Boolean(me.signatureSavedAt)}
        savedHint={savedHint}
        freshOnly={freshSignatureRequired(church, x.tip)}
      />
      {reportCats && x.anRaport ? (
        <div className="card">
          <h3>Persoanele din spatele cifrelor ({x.anRaport})</h3>
          <StatLinks ctx={reportCats.ctx} year={x.anRaport} />
        </div>
      ) : null}
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
