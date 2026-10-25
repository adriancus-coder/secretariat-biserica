"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { NAV_ITEMS, isActive, isMoreActive } from "./nav-items";

/**
 * Pending items shown as badges, by section ("/cereri", "/de-verificat"); only passed to roles that
 * can act on them, which also see the write-only sections.
 */
export function AppNav({ badges = {}, canWrite = false }: { badges?: Record<string, number>; canWrite?: boolean }) {
  const total = Object.values(badges).reduce((a, b) => a + b, 0);
  const pathname = usePathname();
  const badge = (n: number) =>
    n > 0 ? (
      <span className="badge" aria-label={`${n} în așteptare`}>
        {n}
      </span>
    ) : null;
  return (
    <nav className="shell-nav" aria-label="Navigare principală">
      {NAV_ITEMS.filter((item) => canWrite || !item.writeOnly).map((item) => {
        const on = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={item.primary ? undefined : "desk-only"}
            aria-current={on ? "page" : undefined}
          >
            <Icon name={item.icon} />
            {item.label}
            {badge(badges[item.href] ?? 0)}
          </Link>
        );
      })}
      <Link href="/mai-mult" className="mobile-only" aria-current={isMoreActive(pathname) ? "page" : undefined}>
        <Icon name="mai" />
        Mai mult
        {badge(total)}
      </Link>
    </nav>
  );
}
