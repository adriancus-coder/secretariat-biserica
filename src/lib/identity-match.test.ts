import { describe, expect, it } from "vitest";
import { identityMatches, matchingPersons, nameMatches, phoneMatches } from "./identity-match";

const ana = { nume: "Mureșan", prenume: "Ana Maria", telefon: "+47 921 00 001" };

describe("identity check (data-update campaign)", () => {
  it("ignores diacritics, case, word order and hyphens", () => {
    expect(nameMatches("ana maria muresan", ana)).toBe(true);
    expect(nameMatches("MUREȘAN Ana-Maria", ana)).toBe(true);
    expect(nameMatches("Mureşan Ana Maria", ana)).toBe(true); // cedilla ş
  });

  it("accepts a missing middle name and one unknown extra word", () => {
    expect(nameMatches("Ana Mureșan", ana)).toBe(true);
    expect(nameMatches("Ana Ioana Mureșan", ana)).toBe(true);
    expect(nameMatches("Ana Ioana Elena Mureșan", ana)).toBe(false);
  });

  it("refuses a wrong surname or a wrong first name", () => {
    expect(nameMatches("Ana Pop", ana)).toBe(false);
    expect(nameMatches("Ioana Mureșan", ana)).toBe(false);
    expect(nameMatches("Mureșan", ana)).toBe(false);
    expect(nameMatches("", ana)).toBe(false);
  });

  it("compares the last 8 digits of the phone, whatever the prefix and spacing", () => {
    expect(phoneMatches("92100001", ana.telefon)).toBe(true);
    expect(phoneMatches("0047 921 00 001", ana.telefon)).toBe(true);
    expect(phoneMatches("+47-921-00-001", ana.telefon)).toBe(true);
    expect(phoneMatches("+40 721 00 001", ana.telefon)).toBe(false);
    expect(phoneMatches("921 00 002", ana.telefon)).toBe(false);
    expect(phoneMatches("0001", ana.telefon)).toBe(false);
    expect(phoneMatches("92100001", "")).toBe(false);
  });

  it("needs both parts to match the same person", () => {
    expect(identityMatches({ nume: "Ana Mureșan", telefon: "92100001" }, ana)).toBe(true);
    expect(identityMatches({ nume: "Ana Mureșan", telefon: "92100009" }, ana)).toBe(false);
    expect(identityMatches({ nume: "Ana Pop", telefon: "92100001" }, ana)).toBe(false);
    const other = { nume: "Pop", prenume: "Ion", telefon: "+47 900 00 000" };
    expect(matchingPersons({ nume: "Ion Pop", telefon: "92100001" }, [ana, other])).toEqual([]);
    expect(matchingPersons({ nume: "Ion Pop", telefon: "90000000" }, [ana, other])).toEqual([other]);
  });
});
