import { describe, expect, it } from "vitest";
import { matchMeetingType, matchPersonName, nameKey } from "./name-match";

const register = [
  { id: "1", nume: "Pop", prenume: "Ioana" },
  { id: "2", nume: "Ștefănescu", prenume: "Petru" },
  { id: "3", nume: "Pop", prenume: "Vasile" },
  { id: "4", nume: "Pop", prenume: "Vasile" },
  { id: "5", nume: "Mureșan", prenume: "Daniel Ioan" },
  { id: "6", nume: "Cușniriuc", prenume: "Adrian Emanuel" },
  { id: "7", nume: "Vasile-Pop", prenume: "Maria" },
  { id: "8", nume: "Pop", prenume: "Ion Marius" },
  { id: "9", nume: "Pop", prenume: "Ion Daniel" },
  { id: "10", nume: "Lungu", prenume: "Gheorghe Teodor", active: false },
];

describe("matchPersonName", () => {
  it("matches the exact name in either order, without diacritics or case", () => {
    expect(matchPersonName("Ioana Pop", register)).toEqual({ status: "unique", id: "1", how: "exact" });
    expect(matchPersonName("POP ioana", register)).toEqual({ status: "unique", id: "1", how: "exact" });
    expect(matchPersonName("Petru Stefanescu", register)).toEqual({ status: "unique", id: "2", how: "exact" });
    expect(matchPersonName("Mureșan Daniel-Ioan", register)).toEqual({ status: "unique", id: "5", how: "exact" });
  });

  it("matches a partial name when every written word is among the person's words", () => {
    expect(matchPersonName("Adrian Cușniriuc", register)).toEqual({ status: "unique", id: "6", how: "partial" });
    expect(matchPersonName("Adrian Cusniriuc", register)).toEqual({ status: "unique", id: "6", how: "partial" });
    expect(matchPersonName("Cusniriuc Adrian", register)).toEqual({ status: "unique", id: "6", how: "partial" });
    expect(matchPersonName("Emanuel CUȘNIRIUC", register)).toEqual({ status: "unique", id: "6", how: "partial" });
    expect(matchPersonName("Daniel Mureșan", register)).toEqual({ status: "unique", id: "5", how: "partial" });
  });

  it("handles hyphenated surnames", () => {
    expect(matchPersonName("Maria Vasile Pop", register)).toEqual({ status: "unique", id: "7", how: "exact" });
    expect(matchPersonName("Vasile-Pop Maria", register)).toEqual({ status: "unique", id: "7", how: "exact" });
    expect(matchPersonName("Maria Vasile-Pop", register)).toEqual({ status: "unique", id: "7", how: "exact" });
  });

  it("prefers an exact match over a partial one", () => {
    // "Ioana Pop" is also among nobody else's words, but "Vasile Pop" is exact for 3 and 4 and partial for 7.
    expect(matchPersonName("Vasile Pop", register)).toEqual({ status: "ambiguous", ids: ["3", "4"] });
  });

  it("several partial candidates are ambiguous, listed as candidates", () => {
    expect(matchPersonName("Ion Pop", register)).toEqual({ status: "ambiguous", ids: ["8", "9"] });
  });

  it("partial matches only active persons, and never on one word alone", () => {
    expect(matchPersonName("Gheorghe Lungu", register)).toEqual({ status: "none" });
    expect(matchPersonName("Gheorghe Teodor Lungu", register)).toEqual({ status: "unique", id: "10", how: "exact" });
    expect(matchPersonName("Cușniriuc", register)).toEqual({ status: "ambiguous", ids: ["6"] });
  });

  it("reports unknown names", () => {
    expect(matchPersonName("Ioana Popp", register)).toEqual({ status: "none" });
    expect(matchPersonName("  ", register)).toEqual({ status: "none" });
  });

  it("nameKey is diacritic-free, lower-case and sorted", () => {
    expect(nameKey("Cușniriuc  Adrian-Emanuel")).toBe("adrian cusniriuc emanuel");
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
