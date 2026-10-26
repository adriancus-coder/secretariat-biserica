"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { isActive, sideNav, type NavItem } from "./nav-items";

/** localStorage key of the tablet choice (820–1023 px): "lata" = wide with labels, else icons only. */
const WIDE_KEY = "nav-lata";

function readWide(): boolean {
  try {
    return window.localStorage.getItem(WIDE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The sidebar (820 px and up): every entry the user may see, grouped (Principal, Evidență, Rapoarte,
 * Comunitate; a group without entries is left out), the list scrolling inside the bar, and below it
 * Setări plus `children` (the account block, server-rendered). Between 820 and 1023 px it starts
 * narrow (icons, the label as tooltip and accessible name); "Extinde" widens it and is remembered.
 */
export function SideNav({ items, badges = {}, children }: { items: NavItem[]; badges?: Record<string, number>; children?: React.ReactNode }) {
  const pathname = usePathname();
  const { groups, bottom } = sideNav(items);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setWide(readWide());
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-nav-lata", wide);
  }, [wide]);
  const toggle = () => {
    const next = !wide;
    setWide(next);
    try {
      window.localStorage.setItem(WIDE_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the choice lasts until the page is reloaded.
    }
  };

  const link = (item: NavItem) => {
    const n = badges[item.href] ?? 0;
    const name = n > 0 ? `${item.label}, ${n} în așteptare` : item.label;
    return (
      <Link key={item.href} href={item.href} title={item.label} aria-label={name} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
        <Icon name={item.icon} />
        <span className="side-label">{item.label}</span>
        {n > 0 ? (
          <span className="badge" aria-hidden="true">
            {n}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="side-panel">
      <button type="button" className="side-toggle" aria-expanded={wide} onClick={toggle} title={wide ? "Restrânge meniul" : "Extinde meniul"}>
        <Icon name="mai" />
        <span className="side-label">{wide ? "Restrânge meniul" : "Extinde meniul"}</span>
      </button>
      <nav className="side-nav" aria-label="Navigare principală">
        {groups.map((g, i) => (
          <div key={g.title} className="side-group" role="group" aria-labelledby={`side-group-${i}`}>
            <div className="side-group-title" id={`side-group-${i}`}>
              {g.title}
            </div>
            {g.items.map(link)}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        {bottom.map(link)}
        {children}
      </div>
    </div>
  );
}
