import { describe, expect, it } from "vitest";
import { addMemberRegister, parseMemberRegister, type RegisterFields } from "./register-backup";

const r: RegisterFields = {
  dataCasatoriei: "2001-06-10",
  numeTata: "Ion Pop",
  numeMama: "",
  dataCerereRetragere: null,
  plecatDin: "2026-03-01",
  plecatUnde: "Londra",
  intrarePv: "m1",
  iesirePv: null,
};

describe("register fields in the backup", () => {
  it("writes only the fields that are set and reads them back", () => {
    const members: Record<string, Record<string, unknown>> = { p1: { id: "p1", nume: "Pop" }, p2: { id: "p2", nume: "Rus" } };
    addMemberRegister(members, new Map([["p1", r]]));
    expect(members.p1).toEqual({ id: "p1", nume: "Pop", dataCasatoriei: "2001-06-10", numeTata: "Ion Pop", plecatDin: "2026-03-01", plecatUnde: "Londra", intrarePv: "m1" });
    expect(members.p2).toEqual({ id: "p2", nume: "Rus" });
    const back = parseMemberRegister({ members });
    expect(back.get("p1")).toEqual(r);
    expect(back.has("p2")).toBe(false);
  });

  it("ignores invalid dates and ids", () => {
    const back = parseMemberRegister({ members: [{ id: "x", dataCasatoriei: "10.06.2001", intrarePv: "../etc" }] });
    expect(back.get("x")).toMatchObject({ dataCasatoriei: null, intrarePv: null });
  });
});
