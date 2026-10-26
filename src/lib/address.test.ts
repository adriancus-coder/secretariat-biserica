import { describe, expect, it } from "vitest";
import { addressFromInput, formatAddress, splitLegacyAddress } from "./address";

describe("formatAddress", () => {
  it("complete", () => expect(formatAddress({ adresa: "Ulveveien 20", codPostal: "4323", localitate: "Sandnes" })).toBe("Ulveveien 20, 4323 Sandnes"));
  it("without postal code", () => expect(formatAddress({ adresa: "Ulveveien 20", codPostal: "", localitate: "Sandnes" })).toBe("Ulveveien 20, Sandnes"));
  it("without locality", () => expect(formatAddress({ adresa: "Ulveveien 20", codPostal: "4323", localitate: "" })).toBe("Ulveveien 20, 4323"));
  it("street only", () => expect(formatAddress({ adresa: "Ulveveien 20", codPostal: "", localitate: "" })).toBe("Ulveveien 20"));
  it("no street", () => expect(formatAddress({ adresa: "", codPostal: "4323", localitate: "Sandnes" })).toBe("4323 Sandnes"));
  it("multiple spaces", () => expect(formatAddress({ adresa: "  Ulveveien   20 ", codPostal: " 4323", localitate: "Sandnes  Sentrum " })).toBe("Ulveveien 20, 4323 Sandnes Sentrum"));
  it("all empty", () => {
    expect(formatAddress({ adresa: "", codPostal: "", localitate: "" })).toBe("");
    expect(formatAddress({})).toBe("");
    expect(formatAddress(null)).toBe("");
  });
});

describe("splitLegacyAddress", () => {
  it("lower case, double space, no comma", () => {
    expect(splitLegacyAddress("ulveveien 20  4323 sandnes")).toEqual({ adresa: "Ulveveien 20", codPostal: "4323", localitate: "Sandnes" });
  });
  it("with comma", () => expect(splitLegacyAddress("Ulveveien 20, 4323 Sandnes")).toEqual({ adresa: "Ulveveien 20", codPostal: "4323", localitate: "Sandnes" }));
  it("keeps mixed case as typed", () => expect(splitLegacyAddress("Ulveveien 20 b, 4323 SANDNES")?.localitate).toBe("SANDNES"));
  it("a four-digit house number is not the postal code", () => expect(splitLegacyAddress("Storgata 1234 4323 Sandnes")).toEqual({ adresa: "Storgata 1234", codPostal: "4323", localitate: "Sandnes" }));
  it("no match stays whole", () => {
    expect(splitLegacyAddress("Ulveveien 20, Sandnes")).toBeNull();
    expect(splitLegacyAddress("4323 Sandnes")).toBeNull();
    expect(splitLegacyAddress("")).toBeNull();
  });
});

describe("addressFromInput", () => {
  it("splits an old single line", () => expect(addressFromInput({ adresa: "Ulveveien 20, 4323 Sandnes" })).toEqual({ adresa: "Ulveveien 20", codPostal: "4323", localitate: "Sandnes" }));
  it("separate fields win", () => expect(addressFromInput({ adresa: "Ulveveien 20", codPostal: "4323", localitate: "Sandnes" })).toEqual({ adresa: "Ulveveien 20", codPostal: "4323", localitate: "Sandnes" }));
  it("unmatched stays whole", () => expect(addressFromInput({ adresa: "Undeva" })).toEqual({ adresa: "Undeva", codPostal: "", localitate: "" }));
});
