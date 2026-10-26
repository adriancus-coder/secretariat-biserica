import { formatAddress } from "@/lib/address";
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
import { familyOptions, getFamily, personsWithoutFamily } from "@/server/queries/families";
import { canBeHead } from "@/lib/families";
import { DeleteButton } from "@/components/ui/delete-button";
import { dissolveFamilyAction } from "@/server/actions/families";
import { requireCtx } from "@/server/session";
import { PrayerPrefsForm } from "@/components/prayer-prefs-form";
import { prayerChangeText } from "@/lib/prayer";
import { statusTagClass } from "../../persoane/person-row";
import { AddMembersForm, FamilyForm, MoveMemberForm } from "./family-controls";

export const metadata: Metadata = { title: "Familie" };

export default async function FamilyPage({ params }: PageProps<"/familii/[id]">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const ctx = await requireCtx();
  const today = todayIso();
  const church = await getChurch(ctx);
  const f = await getFamily(ctx, id, church.nomen.rudenie);
  if (!f) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const [others, candidates, audit] = await Promise.all([
    canWrite ? familyOptions(ctx).then((list) => list.filter((o) => o.id !== id)) : Promise.resolve([]),
    canWrite ? personsWithoutFamily(ctx, today) : Promise.resolve([]),
    permissions.audit(ctx.user.role)
      ? ctx.db.auditLog.findMany({ where: { entity: "FAMILY", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
      : Promise.resolve([]),
  ]);
  const head = f.members.find((m) => m.id === f.headId);
  const prayer = canWrite
    ? await ctx.db.family.findUniqueOrThrow({ where: { id }, select: { prayerOptOut: true, prayerIncludeChildren: true, prayerChangedAt: true, prayerSource: true } })
    : null;

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

      {formatAddress(f) || f.note ? (
        <dl className="detail mb-4">
          {formatAddress(f) ? (
            <>
              <dt>Adresă</dt>
              <dd>{formatAddress(f)}</dd>
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
            initial={{ nume: f.nume, adresa: f.adresa, codPostal: f.codPostal, localitate: f.localitate, note: f.note, headId: f.headId ?? "" }}
            members={f.members
              .filter((m) => m.id === f.headId || canBeHead({ statut: m.statut, dataNasterii: fromDbDate(m.dataNasterii) }, today))
              .map((m) => ({ id: m.id, name: memberName(m) }))}
          />
        </div>
      ) : null}

      {prayer ? (
        <div className="card" id="rugaciune">
          <h3>Rugăciunea săptămânală</h3>
          <PrayerPrefsForm
            target={{ familyId: f.id }}
            optOut={prayer.prayerOptOut}
            includeChildren={prayer.prayerIncludeChildren}
            source={prayer.prayerSource}
            changed={prayerChangeText(prayer.prayerChangedAt, prayer.prayerSource)}
          />
        </div>
      ) : null}

      {canWrite ? (
        <div className="card">
          <h3>Adaugă membri</h3>
          <AddMembersForm familyId={f.id} candidates={candidates} rudenie={church.nomen.rudenie} />
        </div>
      ) : null}

      {canWrite ? (
        <div className="actions">
          <DeleteButton
            action={dissolveFamilyAction.bind(null, f.id)}
            label="Dizolvă familia"
            confirmMessage={`Dizolvați „${f.nume}”? Cei ${f.members.length} membri rămân în registru, fără familie.`}
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
