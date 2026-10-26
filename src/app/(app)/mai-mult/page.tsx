import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { TextSizeControl } from "@/components/text-size-control";
import { PageHead } from "@/components/ui/page-head";
import { InstallApp } from "@/components/pwa/install-app";
import { permissions } from "@/lib/permissions";
import { TEXT_SIZE_COOKIE, parseUiTextSize } from "@/lib/text-size";
import { requireUser } from "@/server/session";
import { pendingBadges } from "@/server/queries/badges";

export const metadata: Metadata = { title: "Mai mult" };

export default async function MorePage() {
  const user = await requireUser();
  const canWrite = permissions.write(user.role);
  const badges = await pendingBadges(user);
  const textSize = parseUiTextSize((await cookies()).get(TEXT_SIZE_COOKIE)?.value);
  return (
    <>
      <PageHead title="Mai mult" />
      <div className="moremenu">
        {NAV_ITEMS.filter((i) => !i.primary && (canWrite || !i.writeOnly)).map((i) => (
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
      <div className="card mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium">Mărimea textului</span>
        <TextSizeControl current={textSize} />
      </div>
    </>
  );
}
