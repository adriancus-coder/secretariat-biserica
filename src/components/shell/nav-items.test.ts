import { describe, expect, it } from "vitest";
import { permissions, type Permission } from "@/lib/permissions";
import { NAV_ITEMS, navItemsFor, SIDE_BOTTOM, SIDE_GROUPS, sideNav } from "./nav-items";

const forRole = (role: "ADMIN" | "SECRETAR" | "VIZUALIZARE" | "RUGACIUNE") => navItemsFor((p: Permission) => permissions[p]({ role, isPastor: false }));
const labels = (s: ReturnType<typeof sideNav>) => [...s.groups.flatMap((g) => g.items), ...s.bottom].map((i) => i.label);

describe("sidebar (820 px and up)", () => {
  it("places every entry of NAV_ITEMS in exactly one place", () => {
    const placed = [...SIDE_GROUPS.flatMap((g) => g.hrefs), ...SIDE_BOTTOM];
    expect([...placed].sort()).toEqual(NAV_ITEMS.map((i) => i.href).sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("an administrator sees all 15 entries, grouped, with Setări at the bottom", () => {
    const s = sideNav(forRole("ADMIN"));
    expect(s.groups.map((g) => g.title)).toEqual(["Principal", "Evidență", "Rapoarte", "Comunitate"]);
    expect(labels(s)).toEqual(["Acasă", "Persoane", "Familii", "Calendar", "Ședințe", "Cereri", "De verificat", "Documente", "Corespondență", "Patrimoniu", "Mențiuni", "Grupuri", "Statistici", "Rugăciune", "Setări"]);
  });

  it("leaves out groups without an allowed entry: Vizualizare has no Comunitate, Rugăciune only Comunitate", () => {
    expect(sideNav(forRole("VIZUALIZARE")).groups.map((g) => g.title)).toEqual(["Principal", "Evidență", "Rapoarte"]);
    const prayer = sideNav(forRole("RUGACIUNE"));
    expect(prayer.groups).toEqual([{ title: "Comunitate", items: [expect.objectContaining({ href: "/rugaciune" })] }]);
    expect(prayer.bottom).toEqual([]);
  });
});
