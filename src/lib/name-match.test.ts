import { describe, expect, it } from "vitest";
import { matchMeetingType, matchPersonName } from "./name-match";

const register = [
  { id: "1", nume: "Pop", prenume: "Ioana" },
  { id: "2", nume: "Ștefănescu", prenume: "Petru" },
  { id: "3", nume: "Pop", prenume: "Vasile" },
  { id: "4", nume: "Pop", prenume: "Vasile" },
  { id: "5", nume: "Mureșan", prenume: "Daniel Ioan" },
];

describe("matchPersonName", () => {
  it("matches in either order, without diacritics or case", () => {
    expect(matchPersonName("Ioana Pop", register)).toEqual({ status: "unique", id: "1" });
    expect(matchPersonName("POP ioana", register)).toEqual({ status: "unique", id: "1" });
    expect(matchPersonName("Petru Stefanescu", register)).toEqual({ status: "unique", id: "2" });
    expect(matchPersonName("Mureșan Daniel-Ioan", register)).toEqual({ status: "unique", id: "5" });
  });

  it("reports ambiguous and unknown names", () => {
    expect(matchPersonName("Vasile Pop", register)).toEqual({ status: "ambiguous", ids: ["3", "4"] });
    expect(matchPersonName("Ioana Popp", register)).toEqual({ status: "none" });
    expect(matchPersonName("Ioana", register)).toEqual({ status: "none" });
    expect(matchPersonName("  ", register)).toEqual({ status: "none" });
  });
});

describe("matchMeetingType", () => {
  const types = ["Comitet", "Adunare generală", "Frați slujitori", "Altele"];
  it("finds the church's type, falls back otherwise", () => {
    expect(matchMeetingType("comitet", types, "Comitet")).toBe("Comitet");
    expect(matchMeetingType("adunare generala", types, "Comitet")).toBe("Adunare generală");
    expect(matchMeetingType("comitet lărgit", types, "Comitet")).toBe("Comitet");
    expect(matchMeetingType("botez", types, "Comitet")).toBe("Comitet");
    expect(matchMeetingType(null, types, "Comitet")).toBe("Comitet");
  });
});
