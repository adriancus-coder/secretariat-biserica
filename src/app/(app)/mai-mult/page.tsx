import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import { navItemsFor } from "@/components/shell/nav-items";
import { PageHead } from "@/components/ui/page-head";
import { GlobalSearch } from "@/components/global-search";
import { InstallApp } from "@/components/pwa/install-app";
import { permissions } from "@/lib/permissions";
import { requirePermission } from "@/server/session";
import { WideRedirect } from "./wide-redirect";
import { pendingBadges } from "@/server/queries/badges";

export const metadata: Metadata = { title: "Mai mult" };

export default async function MorePage() {
  const user = await requirePermission("read");
  const badges = await pendingBadges(user);
  return (
    <>
      <WideRedirect />
      <PageHead title="Mai mult" />
      <div className="mb-4">
        <GlobalSearch />
      </div>
      <div className="moremenu">
        {navItemsFor((p) => permissions[p](user)).filter((i) => !i.primary).map((i) => (
          <Link key={i.href} href={i.href}>
            <Icon name={i.icon} />
            {i.label}
            {badges[i.href] ? <span className="badge">{badges[i.href]}</span> : null}
          </Link>
        ))}
        <Link href="/cont">
          <Icon name="cont" />
          Contul meu
        </Link>
        <form action="/deconectat" method="post">
          <button type="submit">
            <Icon name="iesire" />
            Ieșire din cont
          </button>
        </form>
      </div>
      <InstallApp className="card mt-4" />
    </>
  );
}
