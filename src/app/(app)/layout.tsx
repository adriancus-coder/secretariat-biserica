import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { AppNav } from "@/components/shell/app-nav";
import { Icon } from "@/components/shell/icons";
import { TextSizeControl } from "@/components/text-size-control";
import { Flash } from "@/components/ui/flash";
import { ROLE_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { TEXT_SIZE_COOKIE, parseUiTextSize } from "@/lib/text-size";
import { pendingBadges } from "@/server/queries/badges";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const canWrite = permissions.write(user.role);
  const badges = await pendingBadges(user);
  const textSize = parseUiTextSize((await cookies()).get(TEXT_SIZE_COOKIE)?.value);
  return (
    <div className="shell">
      <div className="shell-side">
        <header className="shell-top">
          <div className="min-w-0">
            <div className="church truncate">{user.churchName}</div>
            <div className="title">Secretariat</div>
          </div>
          <Link href="/cont" className="mode mobile-only" title="Contul meu">
            {user.isPastor ? "Pastor" : ROLE_LABEL[user.role]}
          </Link>
        </header>
        <AppNav badges={badges} canWrite={canWrite} />
        <div className="shell-user desk-only">
          <TextSizeControl current={textSize} tone="dark" />
          <Link href="/cont" className="who">
            <Icon name="cont" className="size-[18px]" />
            <span className="min-w-0">
              <span className="block truncate">{user.name}</span>
              <span className="block text-[0.7188rem] opacity-70">
                {ROLE_LABEL[user.role]}
                {user.isPastor ? <span className="pastor-badge">Pastor</span> : null}
              </span>
            </span>
          </Link>
          <form action="/deconectat" method="post">
            <button type="submit" className="logout" title="Ieșire din cont">
              <Icon name="iesire" className="size-[18px]" />
              Ieșire
            </button>
          </form>
        </div>
      </div>
      <main className="shell-main" id="continut">
        {children}
      </main>
      <Suspense>
        <Flash />
      </Suspense>
    </div>
  );
}
