import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PageHead } from "@/components/ui/page-head";
import { permissions } from "@/lib/permissions";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Setări" };

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const church = await getChurch(ctx);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const role = ctx.user.role;
  return (
    <>
      <PageHead title="Setări" sub="Organizația, semnături, nomenclatoare" />
      <nav className="moremenu mb-4" aria-label="Secțiuni">
        {permissions.admin(role) ? <Link href="/setari/utilizatori">Utilizatori și roluri</Link> : null}
        {permissions.export(role) ? <Link href="/setari/date">Copie de siguranță (export / import)</Link> : null}
        {permissions.audit(role) ? <Link href="/setari/jurnal">Jurnal de modificări</Link> : null}
        <Link href="/cont">Contul meu</Link>
      </nav>
      <SettingsForm church={church} nomen={church.nomen} readOnly={!permissions.admin(role)} />
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
