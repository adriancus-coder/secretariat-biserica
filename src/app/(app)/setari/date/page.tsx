import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { backupPhotosEstimate } from "@/lib/asset-photos";
import { permissions } from "@/lib/permissions";
import { requireCtx } from "@/server/session";
import { hasStepUp, stepUpMethod } from "@/server/step-up";
import { StepUpGate } from "@/components/passkey/step-up-gate";
import { daysSinceLastExport, EXPORT_REMINDER_DAYS, exportAgeText } from "@/server/queries/export-reminder";
import { memberName } from "@/lib/format";
import Link from "next/link";
import { dismissStatusAdjustmentsAction } from "@/server/actions/statute";
import { FamilyRepair } from "./family-repair";
import { ImportForm } from "./import-form";
import { DownloadForm, DownloadSubmit } from "@/components/ui/download";
import { MIME } from "@/lib/download";

export const metadata: Metadata = { title: "Copie de siguranță" };

export default async function DataPage({ searchParams }: PageProps<"/setari/date">) {
  const sp = await searchParams;
  const ctx = await requireCtx("export");
  const user = ctx.user;
  const autoFamilies = permissions.admin(user.role)
    ? (
        await ctx.db.family.findMany({
          where: { autoCreated: true },
          orderBy: { nume: "asc" },
          select: { id: true, nume: true, head: { select: { nume: true, prenume: true } }, _count: { select: { members: true } } },
        })
      ).map((f) => ({ id: f.id, nume: f.nume, head: f.head ? memberName(f.head) : "", members: f._count.members }))
    : [];
  const exportDays = await daysSinceLastExport(ctx);
  const photoBytes = (await ctx.db.assetPhoto.aggregate({ _sum: { bytes: true } }))._sum.bytes ?? 0;
  const originalBytes = (await ctx.db.meetingSourceFile.aggregate({ _sum: { bytes: true } }))._sum.bytes ?? 0;
  const [stepMethod, stepped] = await Promise.all([stepUpMethod(user.id), hasStepUp(user)]);
  const adjusted = permissions.admin(user.role)
    ? await ctx.db.person.findMany({
        where: { statutAjustat: { not: null } },
        orderBy: [{ sortKey: "asc" }, { id: "asc" }],
        select: { id: true, nume: true, prenume: true, statutAjustat: true },
      })
    : [];
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title="Copie de siguranță" sub="Export și import JSON, compatibil cu formatul prototipului" />
      <div className="card">
        <h3>Export</h3>
        <p className="hint mb-3">
          Toate datele bisericii (persoane, ședințe, evenimente, documente, grupuri, mențiuni și setări) într-un fișier
          JSON. Fișierul conține date personale — păstrați-l în siguranță.
        </p>
        <p className={exportDays === null || exportDays > EXPORT_REMINDER_DAYS ? "alert mb-3" : "hint mb-3"} role="status">
          {exportAgeText(exportDays)} Recomandăm un export cel puțin o dată pe lună (săptămânal cât timp baza de date este pe planul gratuit).
        </p>
        {stepMethod === "passkey" && !stepped ? <StepUpGate method="passkey" what="Exportul conține toate datele bisericii." compact /> : null}
        <DownloadForm method="post" action="/api/export" filename="copie-de-siguranta.json" mime={MIME.json} personal className="grid gap-2 max-w-sm">
          {sp.export === "parola" ? (
            <div className="alert" role="alert">
              Parola nu este corectă.
            </div>
          ) : null}
          {sp.export === "confirmare" ? (
            <div className="alert" role="alert">
              Confirmați întâi identitatea pe dispozitiv.
            </div>
          ) : null}
          {stepped ? (
            <p className="hint !mt-0">Identitatea a fost confirmată; exportul nu mai cere parola timp de 15 minute.</p>
          ) : stepMethod === "password" ? (
            <>
              <label htmlFor="export-parola" className="text-sm font-medium text-ink-2">
                Parola dumneavoastră (pentru confirmare)
              </label>
              <input id="export-parola" name="parola" type="password" autoComplete="current-password" required />
            </>
          ) : null}
          {photoBytes ? (
            <label className="check">
              <input type="checkbox" name="poze" />
              <span>
                Include pozele patrimoniului
                <span className="hint block !mt-0">Fișierul crește cu aproximativ {backupPhotosEstimate(photoBytes)} MB. Importul acceptă fișiere de cel mult 25 MB.</span>
              </span>
            </label>
          ) : null}
          {originalBytes ? (
            <label className="check">
              <input type="checkbox" name="originale" />
              <span>
                Include fișierele originale
                <span className="hint block !mt-0">
                  Documentele Word din care au fost importate procesele-verbale: aproximativ {Math.max(1, Math.round((originalBytes * 4) / 3 / 1024 / 1024))} MB în plus.
                </span>
              </span>
            </label>
          ) : null}
          <div>
            <DownloadSubmit className="btn" disabled={stepMethod === "passkey" && !stepped}>
              Exportă datele (JSON)
            </DownloadSubmit>
          </div>
        </DownloadForm>
      </div>
      {permissions.admin(user.role) ? (
        <div className="card">
          <h3>Import</h3>
          <p className="hint mb-3">
            Acceptă fișiere exportate din aplicație sau din prototipul HTML. Importul se face într-o singură tranzacție:
            dacă fișierul are erori, nu se modifică nimic.
          </p>
          <ImportForm />
        </div>
      ) : (
        <p className="hint">Importul poate fi făcut doar de administrator.</p>
      )}
      {adjusted.length ? (
        <div className="card">
          <h3>Statute ajustate ({adjusted.length})</h3>
          <p className="hint mb-3">
            Statutul Cultului (art. 28) nu mai are categoria „Copil”, iar aparținătorii sunt persoane nebotezate. Aceste
            persoane au primit automat statutul nou; verificați-le și corectați unde este cazul.
          </p>
          <ul className="list scroll-panel mb-3">
            {adjusted.map((p) => (
              <li key={p.id}>
                <Link href={`/persoane/${p.id}`} className="item">
                  <span className="grow">{memberName(p)}</span>
                  <span className="hint">{p.statutAjustat}</span>
                </Link>
              </li>
            ))}
          </ul>
          <form action={dismissStatusAdjustmentsAction}>
            <button type="submit" className="btn">
              Am verificat — ascunde lista
            </button>
          </form>
        </div>
      ) : null}
      {permissions.admin(user.role) ? (
        <div className="card">
          <h3>Familii create automat</h3>
          <FamilyRepair families={autoFamilies} />
        </div>
      ) : null}
    </>
  );
}
