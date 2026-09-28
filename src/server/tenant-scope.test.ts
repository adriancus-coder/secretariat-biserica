import { describe, expect, it } from "vitest";
import { scopeArgs } from "./tenant-scope";

describe("scopeArgs", () => {
  it("adaugă churchId în where pentru citiri, modificări și ștergeri", () => {
    for (const op of ["findUnique", "findFirst", "findMany", "count", "update", "updateMany", "delete", "deleteMany", "groupBy"]) {
      expect(scopeArgs("Person", op, { where: { id: "p1" } }, "c1").where).toEqual({ id: "p1", churchId: "c1" });
    }
  });

  it("suprascrie un churchId străin trimis în where", () => {
    expect(scopeArgs("Person", "findMany", { where: { churchId: "altă" } }, "c1").where).toEqual({ churchId: "c1" });
  });

  it("setează churchId la creare, inclusiv createMany și upsert", () => {
    expect(scopeArgs("Note", "create", { data: { text: "x", churchId: "altă" } }, "c1").data).toEqual({
      text: "x",
      churchId: "c1",
    });
    expect(scopeArgs("Note", "createMany", { data: [{ text: "a" }, { text: "b" }] }, "c1").data).toEqual([
      { text: "a", churchId: "c1" },
      { text: "b", churchId: "c1" },
    ]);
    const up = scopeArgs("Person", "upsert", { where: { id: "p" }, create: { nume: "x" }, update: {} }, "c1");
    expect(up.where).toEqual({ id: "p", churchId: "c1" });
    expect(up.create).toEqual({ nume: "x", churchId: "c1" });
  });

  it("nu modifică modelele care nu aparțin unei biserici", () => {
    const args = { where: { id: "x" } };
    expect(scopeArgs("Church", "findUnique", args, "c1")).toBe(args);
    expect(scopeArgs("MeetingAttendee", "findMany", args, "c1")).toBe(args);
  });
});
