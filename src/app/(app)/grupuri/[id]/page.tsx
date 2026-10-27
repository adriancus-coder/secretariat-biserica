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
import { DownloadLink } from "@/components/ui/download";
import { MIME } from "@/lib/download";

export const metadata: Metadata = { title: "Grup" };

export default async function GroupPage({ params }: PageProps<"/grupuri/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const g = await getGroup(ctx, id);
  if (!g) notFound();
  const canWrite = permissions.write(ctx.user.role);
  const auto = g.membri.filter((m) => m.auto);
  const manual = g.membri.filter((m) => !m.auto);
  const audit = permissions.audit(ctx.user.role)
    ? await ctx.db.auditLog.findMany({ where: { entity: "GROUP", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];
  return (
    <>
      <BackLink href="/grupuri">Grupuri</BackLink>
      <PageHead title={g.nume}>
        <DownloadLink file={`/pdf/grup/${g.id}`} filename="grup.pdf" mime={MIME.pdf} inline>
          Tipărește lista (PDF)
        </DownloadLink>
        {canWrite ? (
          <Link href={`/grupuri/${g.id}/editare`} className="btn btn-primary">
            Editează
          </Link>
        ) : null}
      </PageHead>
      <dl className="detail mb-4">
        {g.functie ? (
          <>
            <dt>Slujirea grupului</dt>
            <dd>{g.functie.nume}</dd>
          </>
        ) : null}
        {g.functieLider ? (
          <>
            <dt>Funcția de conducere</dt>
            <dd>{g.functieLider.nume}</dd>
          </>
        ) : null}
        {g.responsabilName ? (
          <>
            <dt>Responsabil</dt>
            <dd>{g.responsabilP ? <Link href={`/persoane/${g.responsabilP.id}`}>{g.responsabilName}</Link> : g.responsabilName}</dd>
          </>
        ) : null}
        {g.descriere ? (
          <>
            <dt>Descriere</dt>
            <dd className="whitespace-pre-wrap">{g.descriere}</dd>
          </>
        ) : null}
        {g.functie || g.functieLider ? (
          <>
            <dt>Din slujirea „{[g.functie?.nume, g.functieLider?.nume].filter(Boolean).join("” și „")}” ({auto.length})</dt>
            <dd>
              <p className="hint !mt-0 mb-1">
                Se actualizează singur din funcțiile persoanelor. Pentru a scoate pe cineva din listă, modificați funcțiile pe fișa persoanei.
              </p>
              {auto.length ? auto.map((m) => <MemberPill key={m.id} m={m} edit={canWrite} />) : "—"}
            </dd>
            <dt>Adăugați manual ({manual.length})</dt>
            <dd>{manual.length ? manual.map((m) => <MemberPill key={m.id} m={m} />) : "—"}</dd>
          </>
        ) : (
          <>
            <dt>Persoane ({g.membri.length})</dt>
            <dd>{g.membri.length ? g.membri.map((m) => <MemberPill key={m.id} m={m} />) : "—"}</dd>
          </>
        )}
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

/** A member as a link to the person; automatic members link to the person's form for writers (to change their roles). */
function MemberPill({ m, edit }: { m: { id: string; nume: string; prenume: string; dataIesire: Date | null }; edit?: boolean }) {
  return (
    <Link href={edit ? `/persoane/${m.id}/editare` : `/persoane/${m.id}`} className="pill">
      {memberName(m)}
      {m.dataIesire ? " (ieșit)" : ""}
    </Link>
  );
}
