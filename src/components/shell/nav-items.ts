import type { IconName } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Pe telefon, secțiunile secundare sunt în meniul „Mai mult”. */
  primary: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Acasă", icon: "acasa", primary: true },
  { href: "/persoane", label: "Persoane", icon: "persoane", primary: true },
  { href: "/calendar", label: "Calendar", icon: "calendar", primary: true },
  { href: "/procese-verbale", label: "Ședințe", icon: "sedinte", primary: true },
  { href: "/documente", label: "Documente", icon: "documente", primary: false },
  { href: "/grupuri", label: "Grupuri", icon: "grupuri", primary: false },
  { href: "/mentiuni", label: "Mențiuni", icon: "mentiuni", primary: false },
  { href: "/setari", label: "Setări", icon: "setari", primary: false },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/dare-de-seama");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pe telefon, butonul „Mai mult” e activ pentru secțiunile secundare. */
export function isMoreActive(pathname: string): boolean {
  return (
    pathname.startsWith("/mai-mult") ||
    pathname.startsWith("/cont") ||
    NAV_ITEMS.some((i) => !i.primary && isActive(pathname, i.href))
  );
}
