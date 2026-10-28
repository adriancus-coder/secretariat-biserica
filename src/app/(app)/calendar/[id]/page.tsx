import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fmt } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { deleteEventAction } from "@/server/actions/events";
import { EVENT_ROLE_LABEL } from "@/lib/event-persons";
import { eventWithPersons } from "@/server/queries/event-persons";
import { getEvent } from "@/server/queries/events";
import { RegisterCard } from "./register-card";
import { requireCtx } from "@/server/session";
import { DownloadLink } from "@/components/ui/download";
import { MIME } from "@/lib/download";

export const metadata: Metadata = { title: "Eveniment" };

export default async function EventPage({ params }: PageProps<"/calendar/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const x = await getEvent(ctx, id);
  if (!x) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const ep = (await eventWithPersons(ctx, id))!;
  const waiting = ep.persons.some((p) => p.personId && !p.applied) && !ep.registruIgnoratLa;
  const inRegister = ep.persons.filter((p) => p.personId);
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "EVENT", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];

  return (
    <>
      <BackLink href={`/calendar?luna=${x.data.slice(0, 7)}&zi=${x.data}`}>Calendar</BackLink>
      <PageHead title={x.titlu} sub={x.tip}>
        <DownloadLink file={`/pdf/eveniment/${x.id}`} filename="eveniment.pdf" mime={MIME.pdf} inline>
          Tipărește (PDF)
        </DownloadLink>
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
        {x.oficiant ? (
          <>
            <dt>Oficiat de</dt>
            <dd>{x.oficiant}</dd>
          </>
        ) : null}
        {x.descriere ? (
          <>
            <dt>Descriere</dt>
            <dd className="whitespace-pre-wrap">{x.descriere}</dd>
          </>
        ) : null}
      </dl>
      {ep.family || ep.persons.length ? (
        <div className="card">
          <h3>Persoanele evenimentului</h3>
          {ep.family ? (
            <p>
              Familia: <Link href={`/familii/${ep.family.id}`}>{ep.family.nume}</Link>
            </p>
          ) : null}
          {ep.persons.length ? (
            <ul className="mt-1 pl-5 list-disc">
              {ep.persons.map((p) => (
                <li key={p.id}>
                  {EVENT_ROLE_LABEL[p.rol]}: {p.personId ? <Link href={`/persoane/${p.personId}`}>{p.name}</Link> : <>{p.name} <span className="hint inline">(nu e în registru)</span></>}
                  {p.applied ? <span className="hint inline"> · trecut în registru</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {canWrite && ep.taken && inRegister.length && (ep.kind === "binecuvantare" || ep.kind === "botez") ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {inRegister.map((p) => (
                <Link key={p.id} className="btn event-cert" href={`/documente/nou?tip=${ep.kind === "botez" ? "botez" : "binecuvantare"}&persoana=${p.personId}`}>
                  Generează certificatul de {ep.kind === "botez" ? "botez" : "binecuvântare"}: {p.name}
                </Link>
              ))}
            </div>
          ) : null}
          {canWrite && ep.kind === "nunta" && inRegister.length ? (
            <div className="mt-3">
              <Link className="btn" href={`/persoane/${inRegister[0].personId}`}>
                Formează familia
              </Link>
              <p className="hint mt-1">Familia nouă se face din fișa mirelui sau a miresei („Fă cap de familie nouă”); nimeni nu este mutat automat.</p>
            </div>
          ) : null}
          {canWrite && !ep.taken && inRegister.length ? <p className="hint mt-2">După data evenimentului, datele se pot trece în registru de aici.</p> : null}
        </div>
      ) : null}
      {canWrite && ep.taken && waiting ? <RegisterCard eventId={x.id} changes={ep.changes} /> : null}
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
