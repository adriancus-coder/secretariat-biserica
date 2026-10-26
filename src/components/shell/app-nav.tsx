"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { isActive, isMoreActive, type NavItem } from "./nav-items";

/**
 * The entries the user may see (`navItemsFor`, computed on the server) and the pending items shown as
 * badges, by section ("/cereri", "/de-verificat"); only passed to roles that can act on them. Without
 * secondary entries (the "Rugăciune" role) there is no "Mai mult".
 */
export function AppNav({ items, badges = {} }: { items: NavItem[]; badges?: Record<string, number> }) {
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
      {items.map((item) => {
        const on = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={item.mobileOnly ? "mobile-only" : item.primary ? undefined : "desk-only"}
            aria-current={on ? "page" : undefined}
          >
            <Icon name={item.icon} />
            {item.label}
            {badge(badges[item.href] ?? 0)}
          </Link>
        );
      })}
      {items.some((i) => !i.primary) ? (
        <Link href="/mai-mult" className="mobile-only" aria-current={isMoreActive(pathname, items) ? "page" : undefined}>
          <Icon name="mai" />
          Mai mult
          {badge(total)}
        </Link>
      ) : null}
    </nav>
  );
}
