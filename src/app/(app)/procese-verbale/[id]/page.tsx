import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fmt } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { deleteMeetingAction } from "@/server/actions/meetings";
import { getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Proces-verbal" };

export default async function MeetingPage({ params }: PageProps<"/procese-verbale/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const x = await getMeeting(ctx, id);
  if (!x) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "MEETING", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];

  return (
    <>
      <BackLink href="/procese-verbale">Procese-verbale</BackLink>
      <PageHead title={x.titlu || x.tip} sub={x.tip}>
        <a href={`/pdf/proces-verbal/${x.id}`} target="_blank" rel="noopener" className="btn">
          Tipărește (PDF)
        </a>
        {canWrite ? (
          <Link href={`/procese-verbale/${x.id}/editare`} className="btn btn-primary">
            Editează
          </Link>
        ) : null}
      </PageHead>

      <dl className="detail mb-4">
        <dt>Data și locul</dt>
        <dd>
          {fmt(x.data)}
          {x.ora ? `, ora ${x.ora}` : ""}
          {x.loc ? ` · ${x.loc}` : ""}
        </dd>
        <dt>Tip</dt>
        <dd>{x.tip}</dd>
        {x.presedinte ? (
          <>
            <dt>Președinte de ședință</dt>
            <dd>{x.presedinte}</dd>
          </>
        ) : null}
        <dt>Prezenți ({x.prezenti.length})</dt>
        <dd>
          {x.prezenti.length
            ? x.prezenti.map((p, i) => (
                <span key={p.id}>
                  {i ? ", " : ""}
                  <Link href={`/persoane/${p.id}`} className="text-ink">
                    {p.name}
                  </Link>
                </span>
              ))
            : "—"}
          {x.invitati ? (
            <>
              <br />
              Invitați: {x.invitati}
            </>
          ) : null}
        </dd>
        {x.ordine ? (
          <>
            <dt>Ordinea de zi</dt>
            <dd className="whitespace-pre-wrap">{x.ordine}</dd>
          </>
        ) : null}
        {x.discutii ? (
          <>
            <dt>Discuții</dt>
            <dd className="whitespace-pre-wrap">{x.discutii}</dd>
          </>
        ) : null}
        {x.hotarari ? (
          <>
            <dt>Hotărâri</dt>
            <dd className="whitespace-pre-wrap">{x.hotarari}</dd>
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
          <DeleteButton action={deleteMeetingAction.bind(null, x.id)} confirmMessage="Ștergeți procesul-verbal?" />
        </div>
      ) : null}
    </>
  );
}
