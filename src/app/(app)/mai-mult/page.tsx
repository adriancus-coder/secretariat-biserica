import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { PageHead } from "@/components/ui/page-head";
import { logoutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mai mult" };

export default async function MorePage() {
  await requireUser();
  return (
    <>
      <PageHead title="Mai mult" />
      <div className="moremenu">
        {NAV_ITEMS.filter((i) => !i.primary).map((i) => (
          <Link key={i.href} href={i.href}>
            <Icon name={i.icon} />
            {i.label}
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
