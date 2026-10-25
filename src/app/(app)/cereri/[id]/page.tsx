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

export const metadata: Metadata = { title: "Cerere de membru" };

const STATUS_TAG = { PENDING: "tag tag-gold", ACCEPTED: "tag", REJECTED: "tag tag-warn" } as const;

export default async function ApplicationPage({ params }: PageProps<"/cereri/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  if (!idSchema.safeParse(id).success) notFound();
  const a = await getApplication(ctx, id);
  if (!a) notFound();
  const canWrite = permissions.write(ctx.user.role);
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
        a.status === "ACCEPTED" ? "Acceptată" : a.status === "REJECTED" ? "Respinsă" : "",
        a.decidedAt ? `${formatDateTime(a.decidedAt)}${a.decidedBy ? ` de ${a.decidedBy.name}` : ""}` : "",
      ],
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

      {canWrite && a.status === "PENDING" ? (
        <div className="actions flex-wrap">
          <Link href={`/persoane/nou?cerere=${a.id}`} className="btn btn-primary">
            <Icon name="bifa" className="size-[18px]" />
            Acceptă
          </Link>
          <RejectForm id={a.id} />
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
