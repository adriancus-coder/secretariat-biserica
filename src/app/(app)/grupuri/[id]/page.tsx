import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { memberName } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { deleteGroupAction } from "@/server/actions/groups-notes";
import { getGroup } from "@/server/queries/groups-notes";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Grup" };

export default async function GroupPage({ params }: PageProps<"/grupuri/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const g = await getGroup(ctx, id);
  if (!g) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "GROUP", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];
  return (
    <>
      <BackLink href="/grupuri">Grupuri</BackLink>
      <PageHead title={g.nume}>
        <a href={`/pdf/grup/${g.id}`} target="_blank" rel="noopener" className="btn">
          Tipărește lista (PDF)
        </a>
        {canWrite ? (
          <Link href={`/grupuri/${g.id}/editare`} className="btn btn-primary">
            Editează
          </Link>
        ) : null}
      </PageHead>
      <dl className="detail mb-4">
        {g.responsabil ? (
          <>
            <dt>Responsabil</dt>
            <dd>{g.responsabil}</dd>
          </>
        ) : null}
        {g.descriere ? (
          <>
            <dt>Descriere</dt>
            <dd className="whitespace-pre-wrap">{g.descriere}</dd>
          </>
        ) : null}
        <dt>Persoane ({g.membri.length})</dt>
        <dd>
          {g.membri.length
            ? g.membri.map((m) => (
                <Link key={m.id} href={`/persoane/${m.id}`} className="pill">
                  {memberName(m)}
                  {m.dataIesire ? " (ieșit)" : ""}
                </Link>
              ))
            : "—"}
        </dd>
      </dl>
      {audit.length ? (
        <div className="card">
          <h3>Istoric modificări</h3>
          <AuditTrail rows={audit} />
        </div>
      ) : null}
      {canWrite ? (
        <div className="actions">
          <DeleteButton action={deleteGroupAction.bind(null, g.id)} confirmMessage="Ștergeți grupul?" />
        </div>
      ) : null}
    </>
  );
}
