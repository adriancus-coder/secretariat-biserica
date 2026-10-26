import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/audit-trail";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { todayIso } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { ASSET_ORIGIN_LABEL, ASSET_STATE_LABEL, nok } from "@/lib/patrimony";
import { permissions } from "@/lib/permissions";
import { getAsset } from "@/server/queries/assets";
import { requireCtx } from "@/server/session";
import { AssetPhotos } from "../asset-photos";
import { RetireForm } from "../retire-form";

export const metadata: Metadata = { title: "Patrimoniu" };

export default async function AssetPage({ params }: PageProps<"/patrimoniu/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const a = await getAsset(ctx, id);
  if (!a) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const inUse = a.stare !== "SCOS_DIN_UZ";
  const audit = permissions.audit(ctx.user.role) ? await ctx.db.auditLog.findMany({ where: { entity: "ASSET", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 }) : [];
  return (
    <>
      <BackLink href="/patrimoniu">Patrimoniu</BackLink>
      <PageHead title={a.denumire} sub={<span className={`tag${inUse ? "" : " tag-warn"}`}>{ASSET_STATE_LABEL[a.stare]}</span>}>
        {canWrite && inUse ? (
          <Link href={`/patrimoniu/${id}/editare`} className="btn btn-primary">
            Editează
          </Link>
        ) : null}
      </PageHead>
      <dl className="detail mb-4">
        <dt>Nr. de inventar</dt>
        <dd>{a.nrInventar}</dd>
        <dt>Categorie</dt>
        <dd>{a.categorie}</dd>
        <dt>Cantitate · valoare</dt>
        <dd>
          {a.cantitate} · {nok(a.valoare)}
        </dd>
        <dt>Intrare</dt>
        <dd>
          {a.dataIntrarii ? fmt(a.dataIntrarii) : "—"} · {ASSET_ORIGIN_LABEL[a.provenienta]}
        </dd>
        <dt>Unde se află</dt>
        <dd>{a.loc || "—"}</dd>
        <dt>Responsabil</dt>
        <dd>{a.responsabilId ? <Link href={`/persoane/${a.responsabilId}`}>{a.responsabil}</Link> : a.responsabil || "—"}</dd>
        {a.observatii ? (
          <>
            <dt>Observații</dt>
            <dd className="whitespace-pre-wrap">{a.observatii}</dd>
          </>
        ) : null}
        {!inUse ? (
          <>
            <dt>Scos din uz</dt>
            <dd>
              {a.dataIesirii ? fmt(a.dataIesirii) : "—"} · {a.motivIesirii}
            </dd>
          </>
        ) : null}
      </dl>
      <AssetPhotos assetId={id} photos={a.photos} canWrite={canWrite && inUse} denumire={a.denumire} />
      {canWrite && inUse ? (
        <div className="mb-4">
          <RetireForm id={id} today={todayIso()} />
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
