import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { ageAt, fromDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { getChurch } from "@/server/queries/church";
import { familyOptions, getFamily } from "@/server/queries/families";
import { requireCtx } from "@/server/session";
import { statusTagClass } from "../../persoane/person-row";
import { FamilyForm, MoveMemberForm } from "./family-controls";

export const metadata: Metadata = { title: "Familie" };

export default async function FamilyPage({ params }: PageProps<"/familii/[id]">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const ctx = await requireCtx();
  const church = await getChurch(ctx);
  const f = await getFamily(ctx, id, church.nomen.rudenie);
  if (!f) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const today = todayIso();
  const [others, audit] = await Promise.all([
    canWrite ? familyOptions(ctx).then((list) => list.filter((o) => o.id !== id)) : Promise.resolve([]),
    permissions.audit(ctx.user.role)
      ? ctx.db.auditLog.findMany({ where: { entity: "FAMILY", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
      : Promise.resolve([]),
  ]);
  const head = f.members.find((m) => m.id === f.headId);

  return (
    <>
      <BackLink href="/familii">Familii</BackLink>
      <PageHead title={f.nume} sub={`${f.members.length === 1 ? "1 persoană" : `${f.members.length} persoane`}${head ? ` · capul familiei: ${memberName(head)}` : ""}`}>
        {canWrite ? (
          <Link href={`/persoane/nou?familie=${f.id}`} className="btn">
            + Membru
          </Link>
        ) : null}
      </PageHead>

      {f.adresa || f.note ? (
        <dl className="detail mb-4">
          {f.adresa ? (
            <>
              <dt>Adresă</dt>
              <dd>{f.adresa}</dd>
            </>
          ) : null}
          {f.note ? (
            <>
              <dt>Note</dt>
              <dd className="whitespace-pre-wrap">{f.note}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <div className="list mb-4">
        {f.members.map((m) => {
          const dn = fromDbDate(m.dataNasterii);
          const isHead = m.id === f.headId;
          return (
            <div key={m.id} className="item !cursor-default flex-wrap">
              <div className="body">
                <div className="t">
                  <Link href={`/persoane/${m.id}`} className="text-ink">
                    {memberName(m)}
                  </Link>
                  {isHead ? <span className="tag tag-gold ml-1.5">capul familiei</span> : null}
                </div>
                <div className="m">
                  {[isHead ? "" : m.rudenie, dn ? `${ageAt(dn, today)} ani` : "", m.dataIesire ? "ieșit din evidență" : ""].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className={statusTagClass(m.statut)}>{STATUS_LABEL[m.statut]}</span>
              {canWrite && !(isHead && f.members.length > 1) ? (
                <div className="item-actions !pl-0">
                  <MoveMemberForm personId={m.id} name={memberName(m)} families={others} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {canWrite ? (
        <div className="card">
          <h3>Date despre familie</h3>
          <FamilyForm
            id={f.id}
            initial={{ nume: f.nume, adresa: f.adresa, note: f.note, headId: f.headId ?? "" }}
            members={f.members.map((m) => ({ id: m.id, name: memberName(m) }))}
          />
        </div>
      ) : null}

      {audit.length ? (
        <div className="card">
          <h3>Istoric modificări</h3>
          <AuditTrail rows={audit} />
        </div>
      ) : null}
    </>
  );
}
