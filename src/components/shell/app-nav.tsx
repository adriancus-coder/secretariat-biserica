"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { isActive, isMoreActive, type NavItem } from "./nav-items";

/**
 * The phone's bottom bar (below 820 px): the primary entries the user may see (`navItemsFor`, computed
 * on the server) and "Mai mult" for the rest, with the pending items as badges ("/cereri",
 * "/de-verificat"; only passed to roles that can act on them). Without secondary entries (the
 * "Rugăciune" role) there is no "Mai mult". From 820 px `SideNav` shows every entry instead.
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
      {items.filter((i) => i.primary).map((item) => {
        const on = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
          >
            <Icon name={item.icon} />
            {item.label}
            {badge(badges[item.href] ?? 0)}
          </Link>
        );
      })}
      {items.some((i) => !i.primary) ? (
        <Link href="/mai-mult" aria-current={isMoreActive(pathname, items) ? "page" : undefined}>
          <Icon name="mai" />
          Mai mult
          {badge(total)}
        </Link>
      ) : null}
    </nav>
  );
}
