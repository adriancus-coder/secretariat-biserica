import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PageHead } from "@/components/ui/page-head";
import { permissions } from "@/lib/permissions";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getChurch } from "@/server/queries/church";
import { requestOrigin } from "@/server/request-origin";
import { requireCtx } from "@/server/session";
import { appUrl } from "@/server/tokens";
import { dotDateTime } from "@/lib/dates";
import { listStatutes } from "@/server/statutes";
import { SettingsForm } from "./settings-form";
import { privacyTemplate } from "@/lib/privacy";
import { isExtractConfigured } from "@/server/extract";
import { StatutesCard } from "./statutes-card";

export const metadata: Metadata = { title: "Setări" };

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const [church, statutes] = await Promise.all([getChurch(ctx), listStatutes(ctx.user.churchId)]);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const role = ctx.user.role;
  const formUrl = appUrl(`/cerere/${church.slug}`, await requestOrigin());
  return (
    <>
      <PageHead title="Setări" sub="Organizația, semnături, nomenclatoare" />
      <nav className="moremenu mb-4" aria-label="Secțiuni">
        {permissions.admin(role) ? <Link href="/setari/utilizatori">Utilizatori și roluri</Link> : null}
        {permissions.export(role) ? <Link href="/setari/date">Copie de siguranță (export / import)</Link> : null}
        <Link href="/setari/functii">Nomenclatoare: funcții și slujiri</Link>
        {permissions.audit(role) ? <Link href="/setari/jurnal">Jurnal de modificări</Link> : null}
        <Link href="/cont">Contul meu</Link>
      </nav>
      <SettingsForm
        church={church}
        nomen={church.nomen}
        attendanceRules={church.attendanceRules}
        formUrl={formUrl}
        privacyText={church.privacyText.trim() || privacyTemplate(church)}
        privacyUrl={appUrl(`/confidentialitate/${church.slug}`, await requestOrigin())}
        extractAvailable={isExtractConfigured()}
        readOnly={!permissions.admin(role)}
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
      <div className="card mt-7">
        <h3>Aspect</h3>
        <p className="hint mb-3">Tema se păstrează pe acest dispozitiv.</p>
        <ThemeSwitcher current={theme} />
      </div>
      <p className="hint mt-5">
        Datele sunt partajate cu toți utilizatorii bisericii dumneavoastră și nu sunt vizibile altor biserici.
      </p>
    </>
  );
}
