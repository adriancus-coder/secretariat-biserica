import Link from "next/link";
import { Suspense } from "react";
import { AppNav } from "@/components/shell/app-nav";
import { Icon } from "@/components/shell/icons";
import { Flash } from "@/components/ui/flash";
import { ROLE_LABEL } from "@/lib/labels";
import { logoutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell">
      <div className="shell-side">
        <header className="shell-top">
          <div className="min-w-0">
            <div className="church truncate">{user.churchName}</div>
            <div className="title">Secretariat</div>
          </div>
          <Link href="/cont" className="mode mobile-only" title="Contul meu">
            {ROLE_LABEL[user.role]}
          </Link>
        </header>
        <AppNav />
        <div className="shell-user desk-only">
          <Link href="/cont" className="who">
            <Icon name="cont" className="size-[18px]" />
            <span className="min-w-0">
              <span className="block truncate">{user.name}</span>
              <span className="block text-[11.5px] opacity-70">{ROLE_LABEL[user.role]}</span>
            </span>
          </Link>
          <form action={logoutAction}>
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
