import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fmt } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { deleteEventAction } from "@/server/actions/events";
import { getEvent } from "@/server/queries/events";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Eveniment" };

export default async function EventPage({ params }: PageProps<"/calendar/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const x = await getEvent(ctx, id);
  if (!x) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "EVENT", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];

  return (
    <>
      <BackLink href={`/calendar?luna=${x.data.slice(0, 7)}&zi=${x.data}`}>Calendar</BackLink>
      <PageHead title={x.titlu} sub={x.tip}>
        <a href={`/pdf/eveniment/${x.id}`} target="_blank" rel="noopener" className="btn">
          Tipărește (PDF)
        </a>
        {canWrite ? (
          <Link href={`/calendar/${x.id}/editare`} className="btn btn-primary">
            Editează
          </Link>
        ) : null}
      </PageHead>
      <dl className="detail mb-4">
        <dt>Când</dt>
        <dd>
          {fmt(x.data)}
          {x.ora ? `, ora ${x.ora}` : ""}
        </dd>
        <dt>Tip</dt>
        <dd>{x.tip}</dd>
        {x.loc ? (
          <>
            <dt>Loc</dt>
            <dd>{x.loc}</dd>
          </>
        ) : null}
        {x.invitat ? (
          <>
            <dt>Invitat</dt>
            <dd>{x.invitat}</dd>
          </>
        ) : null}
        {x.responsabil ? (
          <>
            <dt>Responsabil</dt>
            <dd>{x.responsabil}</dd>
          </>
        ) : null}
        {x.descriere ? (
          <>
            <dt>Descriere</dt>
            <dd className="whitespace-pre-wrap">{x.descriere}</dd>
          </>
        ) : null}
      </dl>
      {x.agapaActiva ? (
        <div className="card">
          <h3>
            Agapă{x.agapaResponsabil ? ` — resp. ${x.agapaResponsabil}` : ""}
          </h3>
          {x.agapaPersoane ? <div className="hint">Aprox. {x.agapaPersoane} persoane</div> : null}
          {x.contributii.length ? (
            <ul className="mt-2 pl-5 list-disc">
              {x.contributii.map((c, i) => (
                <li key={i}>
                  <b className="font-semibold">{c.cine}</b>: {c.ce}
                </li>
              ))}
            </ul>
          ) : (
            <div className="hint">Nicio contribuție înscrisă încă.</div>
          )}
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
          <DeleteButton action={deleteEventAction.bind(null, x.id)} confirmMessage="Ștergeți evenimentul?" />
        </div>
      ) : null}
    </>
  );
}
