"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { NAV_ITEMS, isActive, isMoreActive } from "./nav-items";

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="shell-nav" aria-label="Navigare principală">
      {NAV_ITEMS.map((item) => {
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
          </Link>
        );
      })}
      <Link href="/mai-mult" className="mobile-only" aria-current={isMoreActive(pathname) ? "page" : undefined}>
        <Icon name="mai" />
        Mai mult
      </Link>
    </nav>
  );
}
