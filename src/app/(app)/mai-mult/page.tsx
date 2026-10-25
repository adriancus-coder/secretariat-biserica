import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { PageHead } from "@/components/ui/page-head";
import { permissions } from "@/lib/permissions";
import { logoutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/session";
import { tenantDb } from "@/server/tenant-db";

export const metadata: Metadata = { title: "Mai mult" };

export default async function MorePage() {
  const user = await requireUser();
  const pending = permissions.write(user.role)
    ? await tenantDb(user.churchId).application.count({ where: { status: "PENDING" } })
    : 0;
  return (
    <>
      <PageHead title="Mai mult" />
      <div className="moremenu">
        {NAV_ITEMS.filter((i) => !i.primary).map((i) => (
          <Link key={i.href} href={i.href}>
            <Icon name={i.icon} />
            {i.label}
            {i.href === "/cereri" && pending > 0 ? <span className="badge">{pending}</span> : null}
          </Link>
        ))}
        <Link href="/cont">
          <Icon name="cont" />
          Contul meu
        </Link>
        <form action={logoutAction}>
          <button type="submit">
            <Icon name="iesire" />
            Ieșire din cont
          </button>
        </form>
      </div>
    </>
  );
}
