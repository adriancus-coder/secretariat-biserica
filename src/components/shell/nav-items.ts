import type { Permission } from "@/lib/permissions";
import type { IconName } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Pe telefon, secțiunile secundare sunt în meniul „Mai mult”. */
  primary: boolean;
  /** Who sees the entry (default "read": every role except "Rugăciune"); the page itself also checks on the server. */
  permission?: Permission;
  /** Only in the phone's bottom bar (the sidebar has its own account link). */
  mobileOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Acasă", icon: "acasa", primary: true },
  { href: "/persoane", label: "Persoane", icon: "persoane", primary: true },
  { href: "/calendar", label: "Calendar", icon: "calendar", primary: true },
  { href: "/procese-verbale", label: "Ședințe", icon: "sedinte", primary: true },
  { href: "/statistici", label: "Statistici", icon: "statistici", primary: false },
  { href: "/familii", label: "Familii", icon: "familii", primary: false },
  { href: "/documente", label: "Documente", icon: "documente", primary: false },
  { href: "/grupuri", label: "Grupuri", icon: "grupuri", primary: false },
  { href: "/mentiuni", label: "Mențiuni", icon: "mentiuni", primary: false },
  { href: "/cereri", label: "Cereri", icon: "cereri", primary: false },
  { href: "/de-verificat", label: "De verificat", icon: "verificat", primary: false, permission: "write" },
  { href: "/rugaciune", label: "Rugăciune", icon: "rugaciune", primary: false, permission: "rugaciune" },
  { href: "/setari", label: "Setări", icon: "setari", primary: false },
];

/**
 * The entries a user sees. The "Rugăciune" role has only the prayer page (and its account): on phones
 * it sits in the bottom bar, with "Contul meu" in place of "Mai mult".
 */
export function navItemsFor(can: (p: Permission) => boolean): NavItem[] {
  const items = NAV_ITEMS.filter((i) => can(i.permission ?? "read"));
  if (can("read")) return items;
  return [...items.map((i) => ({ ...i, primary: true })), { href: "/cont", label: "Contul meu", icon: "cont" as const, primary: true, mobileOnly: true }];
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/dare-de-seama");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pe telefon, butonul „Mai mult” e activ pentru secțiunile secundare. */
export function isMoreActive(pathname: string, items: NavItem[] = NAV_ITEMS): boolean {
  return (
    pathname.startsWith("/mai-mult") ||
    pathname.startsWith("/cont") ||
    items.some((i) => !i.primary && isActive(pathname, i.href))
  );
}
