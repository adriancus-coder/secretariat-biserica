import { describe, expect, it } from "vitest";
import { normalizeSearch, personSortKey, romanianSortKey, searchTerms } from "./text";

describe("normalizeSearch", () => {
  it("elimină diacriticele (inclusiv variantele cu sedilă) și literele mari", () => {
    expect(normalizeSearch("  Ștefănescu  Țiplea Îngrid Ânca ")).toBe("stefanescu tiplea ingrid anca");
    expect(normalizeSearch("Şerban Ţuţea")).toBe("serban tutea");
  });

  it("împarte căutarea în termeni", () => {
    expect(searchTerms("  Pop  Ștefan ")).toEqual(["pop", "stefan"]);
    expect(searchTerms("")).toEqual([]);
  });
});

describe("romanianSortKey", () => {
  const names = [
    "Ștefan Ana",
    "Stan Ion",
    "Ţurcanu Ion",
    "Tudor Maria",
    "Țepeș Vlad",
    "Ăsan Ion",
    "Andrei Ion",
    "Âmbru Ion",
    "Iliescu Ana",
    "Înțeleptu Ana",
    "Popa Ion",
    "Pop Ion",
    "Pop-Ionescu Ana",
    "popescu Ana",
    "Popescu Barbu",
    "Zamfir Éva",
    "Zamfir Eva",
    "Zamfir Ewa",
  ];

  it("reproduce ordinea alfabetică românească (localeCompare 'ro')", () => {
    const byKey = [...names].sort((a, b) => (romanianSortKey(a) < romanianSortKey(b) ? -1 : romanianSortKey(a) > romanianSortKey(b) ? 1 : 0));
    const byLocale = [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), "ro"));
    expect(byKey.map((n) => n.toLowerCase())).toEqual(byLocale.map((n) => n.toLowerCase()));
  });

  it("pune literele cu diacritice după litera de bază", () => {
    expect(romanianSortKey("sz") < romanianSortKey("șa")).toBe(true);
    expect(romanianSortKey("ta") < romanianSortKey("ța")).toBe(true);
    expect(romanianSortKey("az") < romanianSortKey("ăa")).toBe(true);
    expect(romanianSortKey("ăz") < romanianSortKey("âa")).toBe(true);
    expect(romanianSortKey("iz") < romanianSortKey("îa")).toBe(true);
  });

  it("combină numele și prenumele", () => {
    expect(personSortKey("Pop", "Ion") < personSortKey("Popa", "Ana")).toBe(true);
  });
});
