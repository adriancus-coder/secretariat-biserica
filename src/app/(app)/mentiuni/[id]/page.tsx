import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fmt } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { deleteNoteAction } from "@/server/actions/groups-notes";
import { getNote, noteWho } from "@/server/queries/groups-notes";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Mențiune" };

export default async function NotePage({ params }: PageProps<"/mentiuni/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const n = await getNote(ctx, id);
  if (!n) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "NOTE", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];
  return (
    <>
      <BackLink href="/mentiuni">Mențiuni</BackLink>
      <PageHead title={noteWho(n)}>
        {canWrite ? (
          <Link href={`/mentiuni/${n.id}/editare`} className="btn btn-primary">
            Editează
          </Link>
        ) : null}
      </PageHead>
      <dl className="detail mb-4">
        <dt>Data · tip</dt>
        <dd>
          {fmt(n.data)} · {n.tip}
        </dd>
        {n.person ? (
          <>
            <dt>Persoana</dt>
            <dd>
              <Link href={`/persoane/${n.person.id}`}>{noteWho(n)}</Link>
            </dd>
          </>
        ) : null}
        <dt>Mențiune</dt>
        <dd className="whitespace-pre-wrap">{n.text}</dd>
      </dl>
      {audit.length ? (
        <div className="card">
          <h3>Istoric modificări</h3>
          <AuditTrail rows={audit} />
        </div>
      ) : null}
      {canWrite ? (
        <div className="actions">
          <DeleteButton action={deleteNoteAction.bind(null, n.id)} confirmMessage="Ștergeți mențiunea?" />
        </div>
      ) : null}
    </>
  );
}
