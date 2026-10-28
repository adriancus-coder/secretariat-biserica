import { after } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { AppNav } from "@/components/shell/app-nav";
import { SideNav } from "@/components/shell/side-nav";
import { navItemsFor } from "@/components/shell/nav-items";
import { Icon } from "@/components/shell/icons";
import { Flash } from "@/components/ui/flash";
import { AppBadge } from "@/components/pwa/app-badge";
import { ROLE_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { runFirstKinshipCheck } from "@/server/kinship-sync";
import { pendingBadges } from "@/server/queries/badges";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = navItemsFor((p) => permissions[p](user));
  // The "Rugăciune" role gets no register counts at all.
  const badges = permissions.read(user) ? await pendingBadges(user) : {};
  // KINSHIP-AUTO: the church's first full check of the kinship links, once, after the response.
  if (permissions.write(user)) after(() => runFirstKinshipCheck(user));
  return (
    <div className="shell">
      <div className="shell-side">
        <header className="shell-top">
          <div className="min-w-0">
            <div className="church break-words">{user.churchName}</div>
            <div className="title">Secretariat</div>
          </div>
          <Link href="/cont" className="mode mobile-only" title="Contul meu">
            {user.isPastor ? "Pastor" : ROLE_LABEL[user.role]}
          </Link>
        </header>
        <AppNav items={items} badges={badges} />
        <SideNav items={items} badges={badges}>
          <div className="shell-user">
            <div className="side-account">
              <Link href="/cont" className="who" title="Contul meu" aria-label={`Contul meu: ${user.name}`}>
                <Icon name="cont" className="size-[18px]" />
                <span className="side-label min-w-0">
                  <span className="block break-words">{user.name}</span>
                  <span className="block text-[0.7188rem] opacity-70">
                    {ROLE_LABEL[user.role]}
                    {user.isPastor ? <span className="pastor-badge">Pastor</span> : null}
                  </span>
                </span>
              </Link>
              <form action="/deconectat" method="post">
                <button type="submit" className="logout" title="Ieșire din cont" aria-label="Ieșire din cont">
                  <Icon name="iesire" className="size-[18px]" />
                </button>
              </form>
            </div>
          </div>
        </SideNav>
      </div>
      <main className="shell-main" id="continut">
        {children}
      </main>
      <Suspense>
        <Flash />
      </Suspense>
      <AppBadge count={Object.values(badges).reduce((a, b) => a + b, 0)} />
    </div>
  );
}
