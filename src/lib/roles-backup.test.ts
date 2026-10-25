import { describe, expect, it } from "vitest";
import { addMemberRoles, parseRolesJson, rolesToJson } from "./roles-backup";

describe("parseRolesJson", () => {
  it("returns null roles and no functii for older files", () => {
    const r = parseRolesJson({ members: { a: { nume: "Pop" } } });
    expect(r.roles).toBeNull();
    expect(r.functii.size).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it("reads the nomenclature and the roles held by members", () => {
    const r = parseRolesJson({
      roles: rolesToJson([
        { id: "r1", nume: "Pastor", ordine: 0, comitet: true, activ: true },
        { id: "r2", nume: "Lider cor", ordine: 1, comitet: false, activ: false },
      ]),
      members: {
        p1: { nume: "Mureșan", functii: [{ nume: "Pastor", din: "2010-09-01", pana: null }, "Lider cor", { nume: "pastor" }] },
        p2: { nume: "Pop" },
      },
    });
    expect(r.roles).toEqual([
      { id: "r1", nume: "Pastor", ordine: 0, comitet: true, activ: true },
      { id: "r2", nume: "Lider cor", ordine: 1, comitet: false, activ: false },
    ]);
    expect(r.functii.get("p1")).toEqual([
      { nume: "Pastor", din: "2010-09-01", pana: null },
      { nume: "Lider cor", din: null, pana: null },
    ]);
    expect(r.functii.has("p2")).toBe(false);
  });

  it("reports roles without a name and drops duplicates", () => {
    const r = parseRolesJson({ roles: [{ id: "x", nume: "" }, { nume: "Diacon" }, { nume: "diacon" }] });
    expect(r.errors).toHaveLength(1);
    expect(r.roles?.map((x) => x.nume)).toEqual(["Diacon"]);
    expect(r.warnings).toHaveLength(1);
  });
});

describe("addMemberRoles", () => {
  it("adds functii only to members that hold roles", () => {
    const members: Record<string, Record<string, unknown>> = { a: { nume: "A" }, b: { nume: "B" } };
    addMemberRoles(members, new Map([["a", [{ nume: "Diacon", din: null, pana: null }]], ["b", []]]));
    expect(members.a.functii).toEqual([{ nume: "Diacon", din: null, pana: null }]);
    expect("functii" in members.b).toBe(false);
  });
});
