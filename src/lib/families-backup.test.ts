import { describe, expect, it } from "vitest";
import { addMemberFamilies, familiesToJson, parseFamiliesJson } from "./families-backup";

describe("families in the backup", () => {
  it("round-trips families and members' familyId", () => {
    const members: Record<string, Record<string, unknown>> = { p1: { nume: "Pop", familie: "Fam. Vasile Pop" }, p2: { nume: "Ion" } };
    addMemberFamilies(members, new Map([["p1", "f1"]]));
    const json = { families: familiesToJson([{ id: "f1", nume: "Fam. Vasile Pop", capId: "p1", adresa: "Str. 1", note: "" }]), members };
    const r = parseFamiliesJson(json);
    expect(r.errors).toEqual([]);
    expect(r.families).toEqual([{ id: "f1", nume: "Fam. Vasile Pop", capId: "p1", adresa: "Str. 1", note: "" }]);
    expect(r.memberFamily).toEqual(new Map([["p1", "f1"]]));
  });

  it("returns null families for older files; ignores references to unknown families", () => {
    expect(parseFamiliesJson({ members: { p1: { familie: "Pop" } } }).families).toBeNull();
    const r = parseFamiliesJson({ families: [{ id: "f1", nume: "A" }], members: { p1: { familyId: "nu-exista" } } });
    expect(r.memberFamily.size).toBe(0);
  });

  it("reports families without a name or with a bad id", () => {
    expect(parseFamiliesJson({ families: [{ id: "f1", nume: "" }, { id: "a b", nume: "X" }] }).errors).toHaveLength(2);
  });
});
