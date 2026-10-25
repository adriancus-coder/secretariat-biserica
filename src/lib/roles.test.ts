import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_GROUPS, defaultRoleGroupsData, roleKey } from "./roles";

describe("role groups", () => {
  it("creates the default groups with their roles", () => {
    let n = 0;
    const { groups, roles } = defaultRoleGroupsData("c1", () => `id${n++}`);
    expect(groups.map((g) => g.nume)).toEqual(["Funcții", "Slujiri"]);
    expect(roles.filter((r) => r.groupId === groups[1].id).map((r) => r.nume)).toEqual(DEFAULT_ROLE_GROUPS[1].roles);
    expect(roles.every((r) => r.churchId === "c1")).toBe(true);
    expect(roles.map((r) => r.nume)).not.toContain("Membru comitet");
  });
  it("compares names without case and diacritics", () => {
    expect(roleKey(" Laudă și  Închinare ")).toBe(roleKey("lauda si inchinare"));
    expect(roleKey("Cor")).not.toBe(roleKey("Coral"));
  });
});
