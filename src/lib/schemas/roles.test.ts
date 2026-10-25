import { describe, expect, it } from "vitest";
import { rolesText } from "../roles";
import { personRolesSchema, roleSchema } from "./roles";

describe("personRolesSchema", () => {
  it("parses the hidden JSON field and drops duplicates", () => {
    const r = personRolesSchema.parse(JSON.stringify([{ id: "a1", din: "2020-02-01" }, { id: "b2", din: "" }, { id: "a1", din: "" }]));
    expect(r).toEqual([
      { roleId: "a1", since: "2020-02-01" },
      { roleId: "b2", since: null },
    ]);
  });

  it("treats a missing field as no roles", () => {
    expect(personRolesSchema.parse(null)).toEqual([]);
    expect(personRolesSchema.parse("")).toEqual([]);
  });

  it("rejects malformed input", () => {
    expect(personRolesSchema.safeParse("{nu e json").success).toBe(false);
    expect(personRolesSchema.safeParse(JSON.stringify([{ id: "a b" }])).success).toBe(false);
    expect(personRolesSchema.safeParse(JSON.stringify([{ id: "a", din: "2020-13-01" }])).success).toBe(false);
  });
});

describe("roleSchema", () => {
  it("requires a name and reads the committee switch", () => {
    expect(roleSchema.parse({ nume: " Diacon " })).toEqual({ nume: "Diacon" });
    expect(roleSchema.safeParse({ nume: "  " }).success).toBe(false);
  });
});

describe("rolesText", () => {
  it("lists the roles with their start dates", () => {
    expect(rolesText([{ nume: "Diacon", since: "2020-02-01" }, { nume: "Lider cor", since: null }])).toBe("Diacon (din 1 feb 2020), Lider cor");
    expect(rolesText([])).toBe("");
  });
});
