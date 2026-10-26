import type { Metadata } from "next";
import { baptismSentence } from "@/lib/baptism";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail, formatDateTime } from "@/components/audit-trail";
import { Icon } from "@/components/shell/icons";
import { DeleteButton } from "@/components/ui/delete-button";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fromDbDate } from "@/lib/dates";
import { fmt, memberName } from "@/lib/format";
import { APPLICATION_KIND_LABEL, APPLICATION_STATUS_LABEL, GENDER_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { deleteApplicationAction } from "@/server/actions/applications";
import { getApplication } from "@/server/queries/applications";
import { requireCtx } from "@/server/session";
import { RejectForm } from "./reject-form";
import { ApproveButton } from "@/components/approve-button";
import { approveApplicationAction } from "@/server/actions/pastor-proposals";
import { hasActivePastor } from "@/server/pastor-approval";

export const metadata: Metadata = { title: "Cerere de membru" };

const STATUS_TAG = { PENDING: "tag tag-gold", PROPUSA: "tag tag-gold", ACCEPTED: "tag", REJECTED: "tag tag-warn" } as const;

export default async function ApplicationPage({ params }: PageProps<"/cereri/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  if (!idSchema.safeParse(id).success) notFound();
  const a = await getApplication(ctx, id);
  if (!a) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const isPastor = permissions.pastor(ctx.user);
  // Statut art. 23 alin. 3: with a pastor in the app the secretary proposes, the pastor decides.
  const approval = await hasActivePastor(ctx.user.churchId);
  const proposer = a.propusDeId ? await ctx.db.user.findFirst({ where: { id: a.propusDeId }, select: { name: true } }) : null;
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "APPLICATION", entityId: id }, orderBy: { createdAt: "desc" }, take: 20 })
    : [];

  const dn = fromDbDate(a.dataNasterii);
  const db = fromDbDate(a.dataBotez);
  const rows = (
    [
      ["Tip cerere", APPLICATION_KIND_LABEL[a.kind]],
      ["Trimisă", formatDateTime(a.createdAt)],
      ["Gen", a.gen ? GENDER_LABEL[a.gen] : ""],
      ["Data nașterii", dn ? fmt(dn) : ""],
      ["Telefon", a.telefon],
      ["E-mail", a.email],
      ["Adresă", a.adresa],
      ["Familie", a.familie ? a.familie + (a.rudenie ? ` — ${a.rudenie}` : "") : a.rudenie],
      ["Biserica de proveniență", a.bisericaProvenienta],
      ["Botez în apă", baptismSentence({ ...a, data: db ? fmt(db) : "" })],
      ["Mesaj", a.mesaj],
      ["Acord pentru păstrarea datelor", a.consent ? "da" : "nu"],
      [
        "Statute acceptate",
        [a.consentStatutCult ? "statutul cultului" : "", a.consentStatutIntern ? "statutul intern" : ""].filter(Boolean).join(", ") +
          (a.consentAt && (a.consentStatutCult || a.consentStatutIntern) ? ` (${formatDateTime(a.consentAt)})` : ""),
      ],
      [
        a.status === "ACCEPTED" ? "Acceptată" : a.status === "REJECTED" ? "Respinsă" : "",
        a.decidedAt ? `${formatDateTime(a.decidedAt)}${a.decidedBy ? ` de ${a.decidedBy.name}` : ""}` : "",
      ],
      ["Propusă pastorului", a.propusLa && a.status !== "PENDING" ? `${formatDateTime(a.propusLa)}${proposer ? ` de ${proposer.name}` : ""}` : ""],
      ["Motivul respingerii", a.rejectReason],
    ] as [string, string][]
  ).filter(([k, v]) => k && v);

  return (
    <>
      <BackLink href="/cereri">Cereri</BackLink>
      <PageHead title={memberName(a)} sub={<span className={STATUS_TAG[a.status]}>{APPLICATION_STATUS_LABEL[a.status]}</span>} />

      {a.person ? (
        <p className="alert alert-ok">
          În registru: <Link href={`/persoane/${a.person.id}`}>{memberName(a.person)}</Link>
        </p>
      ) : null}

      <dl className="detail mb-4">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
      </dl>

      {approval && isPastor && (a.status === "PENDING" || a.status === "PROPUSA") ? (
        <div className="card">
          <h3>Decizia pastorului</h3>
          <p className="hint">
            {a.status === "PROPUSA"
              ? "Secretariatul a pregătit fișa persoanei. „Aprobă primirea” o trece în registru exact cum a fost propusă."
              : "Cererea nu a fost încă pregătită de secretariat; o puteți accepta completând fișa."}
          </p>
          <div className="actions flex-wrap !justify-start">
            {a.status === "PROPUSA" && a.propunere ? <ApproveButton action={approveApplicationAction.bind(null, a.id)} label="Aprobă primirea" /> : null}
            <Link href={`/persoane/nou?cerere=${a.id}`} className={a.status === "PROPUSA" ? "btn" : "btn btn-primary"}>
              {a.status === "PROPUSA" ? "Verifică și modifică" : "Acceptă"}
            </Link>
            <RejectForm id={a.id} />
          </div>
        </div>
      ) : canWrite && (a.status === "PENDING" || (approval && a.status === "PROPUSA")) ? (
        <div className="actions flex-wrap">
          <Link href={`/persoane/nou?cerere=${a.id}`} className="btn btn-primary">
            <Icon name="bifa" className="size-[18px]" />
            {!approval ? "Acceptă" : a.status === "PROPUSA" ? "Modifică propunerea" : "Propune acceptarea"}
          </Link>
          {a.status === "PENDING" ? <RejectForm id={a.id} /> : <p className="hint w-full">Propunerea așteaptă decizia pastorului.</p>}
        </div>
      ) : null}

      {audit.length ? (
        <div className="card">
          <h3>Istoric</h3>
          <AuditTrail rows={audit} />
        </div>
      ) : null}

      {permissions.admin(ctx.user.role) ? (
        <div className="actions">
          <DeleteButton action={deleteApplicationAction.bind(null, a.id)} confirmMessage="Ștergeți definitiv această cerere?" />
        </div>
      ) : null}
    </>
  );
}
