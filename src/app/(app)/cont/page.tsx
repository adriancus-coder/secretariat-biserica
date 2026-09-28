import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PageHead } from "@/components/ui/page-head";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/labels";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { logoutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Contul meu" };

export default async function AccountPage({ searchParams }: PageProps<"/cont">) {
  const user = await requireUser();
  const sp = await searchParams;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <>
      <PageHead title="Contul meu" sub={user.churchName} />
      {sp.parola === "schimbata" ? (
        <div className="alert alert-ok" role="status">
          Parola a fost schimbată. Sesiunile de pe alte dispozitive au fost închise.
        </div>
      ) : null}
      <div className="card">
        <h3>{user.name}</h3>
        <dl className="detail">
          <dt>E-mail</dt>
          <dd>{user.email}</dd>
          <dt>Rol</dt>
          <dd>
            {ROLE_LABEL[user.role]} <span className="hint">— {ROLE_DESCRIPTION[user.role]}</span>
          </dd>
        </dl>
      </div>
      <div className="card">
        <h3>Schimbă parola</h3>
        <ChangePasswordForm />
      </div>
      <div className="card">
        <h3>Aspect</h3>
        <p className="hint mb-3">Tema se păstrează pe acest dispozitiv.</p>
        <ThemeSwitcher current={theme} />
      </div>
      <form action={logoutAction} className="mt-4">
        <button type="submit" className="btn btn-danger">
          Ieșire din cont
        </button>
      </form>
    </>
  );
}
