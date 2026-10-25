import { describe, expect, it } from "vitest";
import { childChanges, decisionStatus, displayValue, selfChanges } from "./data-update-review";
import type { SelfData } from "./schemas/data-update";

const base: SelfData = {
  nume: "Pop",
  prenume: "Ion",
  gen: "M",
  dataNasterii: "1980-01-01",
  dataCasatoriei: null,
  telefon: "+47 900 00 001",
  email: "",
  adresa: "Stavanger",
  dataBotez: null,
  botezAn: 2001,
  botezBiserica: "",
  botezLocalitate: "",
  botezOficiant: "",
  numeTata: "",
  numeMama: "",
};

describe("data-update review", () => {
  it("lists only the changed fields, with readable values", () => {
    const changes = selfChanges(base, { ...base, telefon: "+47 900 00 009", dataCasatoriei: "2005-06-11", adresa: " Stavanger " });
    expect(changes).toEqual([
      { field: "dataCasatoriei", label: "Data căsătoriei", before: "—", after: "11 iun 2005" },
      { field: "telefon", label: "Telefon", before: "+47 900 00 001", after: "+47 900 00 009" },
    ]);
    expect(selfChanges(null, base).map((c) => c.field)).toContain("nume");
  });

  it("compares a child's fields and shows the gender's label", () => {
    expect(childChanges({ nume: "Pop", prenume: "Ana", gen: null }, { nume: "Pop", prenume: "Ana", gen: "F", dataNasterii: null, dataBinecuvantare: null })).toEqual([
      { field: "gen", label: "Gen", before: "—", after: "Feminin" },
    ]);
    expect(displayValue("dataNasterii", "2015-05-01")).toBe("1 mai 2015");
  });

  it("is accepted when everything was taken, partial otherwise", () => {
    expect(decisionStatus(3, 3)).toBe("ACCEPTED");
    expect(decisionStatus(0, 0)).toBe("ACCEPTED");
    expect(decisionStatus(3, 1)).toBe("PARTIAL");
  });
});
