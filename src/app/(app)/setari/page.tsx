import { hasStepUp, stepUpMethod } from "@/server/step-up";
import { StepUpGate } from "@/components/passkey/step-up-gate";
import type { Metadata } from "next";
import Link from "next/link";
import { GlobalSearch } from "@/components/global-search";
import { cookies } from "next/headers";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PageHead } from "@/components/ui/page-head";
import { permissions } from "@/lib/permissions";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getChurch } from "@/server/queries/church";
import { requestOrigin } from "@/server/request-origin";
import { requireCtx } from "@/server/session";
import { appUrl } from "@/server/tokens";
import { dotDateTime, todayIso } from "@/lib/dates";
import { listStatutes } from "@/server/statutes";
import { SettingsForm } from "./settings-form";
import { privacyTemplate } from "@/lib/privacy";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";
import { privacyModelOutdated } from "@/lib/privacy";
import { adoptPrivacyModelAction } from "@/server/actions/settings";
import { StatutesCard } from "./statutes-card";
import { CommitteeCard } from "./committee-card";
import { PrayerMessageCard } from "./prayer-message-card";
import { prayerSamples } from "@/server/queries/prayer";
import { ExcerptsCard } from "./excerpts-card";
import { isDefaultExcerpts } from "@/lib/statute-excerpts";
import { mandateEnd, mandateNotice } from "@/lib/committee";
import { fmtL, memberName } from "@/lib/format";
import { meetingChoices } from "@/server/queries/meetings";
import { ApplicationLink } from "./application-link";
import { applicationQrPng, applicationQrSvg } from "@/server/application-link";
import { applicationLinkSubject, isEmailConfigured } from "@/server/email";

export const metadata: Metadata = { title: "Setări" };

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const [church, statutes, meetings, committee] = await Promise.all([
    getChurch(ctx),
    listStatutes(ctx.user.churchId),
    meetingChoices(ctx),
    ctx.db.person.findMany({ where: { inComitet: true, dataIesire: null }, orderBy: [{ sortKey: "asc" }, { id: "asc" }], select: { id: true, nume: true, prenume: true } }),
  ]);
  const jar = await cookies();
  const [stepMethod, stepped] = await Promise.all([stepUpMethod(ctx.user.id), hasStepUp(ctx.user)]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const role = ctx.user.role;
  const formUrl = appUrl(`/cerere/${church.slug}`, await requestOrigin());
  // The QR code and the sending controls are for those who may write; it follows the saved slug.
  const linkPanel = permissions.write(role) ? (
    <ApplicationLink
      url={formUrl}
      slug={church.slug}
      qrSvg={await applicationQrSvg(formUrl)}
      qrPng={`data:image/png;base64,${(await applicationQrPng(formUrl)).toString("base64")}`}
      open={church.applicationsOpen}
      emailConfigured={isEmailConfigured()}
      subject={applicationLinkSubject(church.nume)}
      frame={{ start: `Bună ziua, Puteți completa cererea de membru a bisericii ${church.nume} online, la adresa:`, end: `Cu stimă, Secretariatul bisericii ${church.nume} — trimis din Secretariat Biserică` }}
    />
  ) : null;
  return (
    <>
      <PageHead title="Setări" sub="Organizația, semnături, nomenclatoare" />
      {/* GLOBAL-SEARCH on phones (from 820 px the sidebar has „Caută”). */}
      <div className="mobile-only mb-4">
        <GlobalSearch />
      </div>
      {permissions.admin(role) && !stepped ? (
        <StepUpGate method={stepMethod} what="Nota de informare, securitatea autentificării și statutele se modifică după confirmarea identității." compact />
      ) : null}
      <nav className="moremenu mb-4" aria-label="Secțiuni">
        {permissions.admin(role) ? <Link href="/setari/utilizatori">Utilizatori și roluri</Link> : null}
        {permissions.export(role) ? <Link href="/setari/date">Copie de siguranță (export / import)</Link> : null}
        {permissions.write(role) ? <Link href="/setari/actualizare-date">Actualizare date (campanie)</Link> : null}
        <Link href="/setari/functii">Nomenclatoare: funcții și slujiri</Link>
        {permissions.audit(role) ? <Link href="/setari/jurnal">Jurnal de modificări</Link> : null}
        <Link href="/cont">
          Contul meu
          <span className="moremenu-sub">parolă, autentificare, aspect (mărimea textului)</span>
        </Link>
      </nav>
      {permissions.admin(role) && privacyModelOutdated(church) ? (
        <div className="alert mb-4" role="status">
          Există o versiune nouă a modelului notei de informare ({PRIVACY_NOTICE_VERSION}), după Statutul Cultului.{" "}
          <Link href="/setari/nota-informare">Vezi diferențele</Link>
          <form action={adoptPrivacyModelAction} className="inline ml-2">
            <button type="submit" className="btn btn-sm">
              Folosește modelul nou
            </button>
          </form>
        </div>
      ) : null}
      <SettingsForm
        church={church}
        nomen={church.nomen}
        attendanceRules={church.attendanceRules}
        tipuriAG={church.tipuriAG}
        tipuriCvorum={church.tipuriCvorum}
        formUrl={formUrl}
        privacyText={church.privacyText.trim() || privacyTemplate(church)}
        privacyUrl={appUrl(`/confidentialitate/${church.slug}`, await requestOrigin())}
        readOnly={!permissions.admin(role)}
        applicationLink={linkPanel}
      />
      <CommitteeCard
        alesLa={church.comitetAlesLa}
        sedinta={meetings.find((m) => m.id === church.comitetAlegereMeetingId) ?? null}
        prelungit={church.comitetPrelungit}
        end={church.comitetAlesLa ? fmtL(mandateEnd(church.comitetAlesLa, church.comitetPrelungit)) : null}
        meetings={meetings.map((m) => ({ value: m.id, label: m.label }))}
        members={committee.map((p) => ({ id: p.id, name: memberName(p) }))}
        notice={mandateNotice(todayIso(), church.comitetAlesLa, church.comitetPrelungit)}
        readOnly={!permissions.admin(role)}
      />
      <PrayerMessageCard
        family={church.prayerMessage}
        person={church.prayerMessagePerson}
        readOnly={!permissions.admin(role)}
        samples={permissions.admin(role) ? await prayerSamples(ctx) : { family: null, person: null }}
        today={todayIso()}
      />
      <StatutesCard
        slug={church.slug}
        readOnly={!permissions.admin(role)}
        statutes={statutes.map((d) => ({
          kind: d.kind,
          fileName: d.fileName,
          details: `${Math.max(1, Math.round(d.size / 1024))} KB · încărcat la ${dotDateTime(d.uploadedAt)}`,
        }))}
      />
      <ExcerptsCard excerpts={church.statutExtrase} isDefault={isDefaultExcerpts(church.statutExtrase)} readOnly={!permissions.admin(role)} />
      <div className="card mt-7">
        <h3 id="aspect">Aspect</h3>
        <p className="hint mb-3">
          Tema se păstrează pe acest dispozitiv. Mărimea textului se alege la <Link href="/cont">Contul meu → Aspect</Link>.
        </p>
        <ThemeSwitcher current={theme} />
      </div>
      <p className="hint mt-5">
        Datele sunt partajate cu toți utilizatorii bisericii dumneavoastră și nu sunt vizibile altor biserici.
      </p>
    </>
  );
}
