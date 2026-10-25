import { describe, expect, it } from "vitest";
import { ageKey, CATEGORIES, categoryContext, categoryDef, combineCategories, type CategoryInput } from "./categories";
import { AGE_BANDS, computeStats } from "./stats";
import { event, person } from "./test-helpers";
import type { PersonRecord } from "./types";

const TODAY = "2026-10-25";

/** A small church like the demo seed: families of members and aparținători, children, entries and exits over the years. */
function church(): { input: Omit<CategoryInput, "year">; persons: PersonRecord[] } {
  const persons = [
    person({ id: "h1", nume: "Mureșan", prenume: "Daniel", gen: "M", familyId: "f1", rudenie: "Cap de familie", dataNasterii: "1975-03-01", dataMembru: "2000-01-01", dataBotez: "1995-06-01", modIntrare: "BOTEZ" }),
    person({ id: "w1", nume: "Mureșan", prenume: "Lidia", gen: "F", familyId: "f1", dataNasterii: "1978-05-01", dataMembru: "2001-01-01", dataBotez: "1998-06-01" }),
    person({ id: "c1", nume: "Mureșan", prenume: "Sara", gen: "F", familyId: "f1", statut: "APARTINATOR", dataNasterii: "2015-01-01", dataBinecuvantare: "2015-06-01" }),
    person({ id: "c2", nume: "Mureșan", prenume: "Iosif", gen: "M", familyId: "f1", statut: "APARTINATOR", dataNasterii: "2010-09-09" }),
    person({ id: "a1", nume: "Pop", prenume: "Vasile", gen: "M", familyId: "f2", rudenie: "Cap de familie", statut: "APARTINATOR", dataNasterii: "1980-01-01" }),
    person({ id: "c3", nume: "Pop", prenume: "Ana", gen: "F", familyId: "f2", statut: "APARTINATOR", dataNasterii: "2018-02-02" }),
    person({ id: "c4", nume: "Solo", prenume: "Copil", gen: "M", statut: "APARTINATOR", dataNasterii: "2019-02-02" }),
    person({ id: "p1", nume: "Prieten", prenume: "Ion", gen: "M", statut: "PRIETEN", dataNasterii: "1990-01-01" }),
    person({ id: "t1", nume: "Transfer", prenume: "Eva", gen: "F", dataNasterii: "1960-01-01", dataMembru: "2026-02-01", modIntrare: "TRANSFER", dataBotez: "1980-01-01" }),
    person({ id: "t2", nume: "Transfer", prenume: "Old", gen: "M", dataNasterii: "1950-01-01", dataMembru: "2025-02-01", modIntrare: "TRANSFER", botezAn: 1970 }),
    person({ id: "r1", nume: "Cerere", prenume: "Nou", gen: "M", dataNasterii: "1999-01-01", dataMembru: "2026-03-01", modIntrare: "CERERE_MEMBRALITATE", dataBotez: "2026-03-01" }),
    person({ id: "x1", nume: "Ieșit", prenume: "Fost", gen: "M", statut: "FOST_MEMBRU", dataNasterii: "1940-01-01", dataMembru: "1990-01-01", dataIesire: "2025-05-05", modIesire: "DECES" }),
    person({ id: "n1", nume: "Fără", prenume: "Dată", gen: "F" }),
  ];
  return {
    persons,
    input: {
      persons,
      events: [event({ tip: "Nuntă", data: "2026-07-01" })],
      today: TODAY,
      committee: new Set(["h1"]),
      heads: new Set(["h1", "a1"]),
      holders: new Map([["pastor", new Set(["h1"])], ["cor", new Set(["w1", "x1"])]]),
    },
  };
}

describe("person categories", () => {
  for (const year of [undefined, 2025]) {
    it(`every category on Acasă has exactly as many persons as its number (${year ?? "today"})`, () => {
      const { input } = church();
      const ctx = categoryContext({ ...input, year });
      const s = computeStats(input.persons, input.events, { year, today: TODAY });
      const n = (k: string) => ctx.ids(k)!.length;
      expect([n("toti"), n("membri"), n("apartinatori"), n("prieteni"), n("botezati"), n("copii-minori"), n("copii-membri")]).toEqual([
        s.ev.length,
        s.membri.length,
        s.apart.length,
        s.prieteni.length,
        s.botezati.length,
        s.copii.length,
        s.copiiMembri.length,
      ]);
      expect([n("barbati"), n("femei")]).toEqual([s.gen.M, s.gen.F]);
      expect([n("intrati-botez"), n("intrati-transfer"), n("reprimiti"), n("binecuvantati"), n("iesiti-an")]).toEqual([
        s.intrBotez.length,
        s.intrTransfer.length,
        s.reprimiri.length,
        s.binecuv.length,
        s.iesiri.length,
      ]);
      s.bands.forEach(([, count], i) => expect(n(ageKey(AGE_BANDS[i][1], AGE_BANDS[i][2]))).toBe(count));
      expect(n("fara-data-nasterii")).toBe(s.ev.filter((p) => !p.dataNasterii).length);
    });
  }

  it("the other categories follow their definitions", () => {
    const { input, persons } = church();
    const ctx = categoryContext(input);
    const of = (k: string, f?: string) => ctx.ids(k, f)!.sort();
    expect(of("copii-membri")).toEqual(["c1", "c2"]);
    expect(of("copii-apartinatori")).toEqual(["c3"]);
    expect(of("copii-fara-familie")).toEqual(["c4"]);
    expect(of("intrati-cerere")).toEqual(["r1"]);
    expect(of("comitet")).toEqual(["h1"]);
    expect(of("cu-functie")).toEqual(["h1", "w1"]); // x1 left the register
    expect(of("cu-functie", "cor")).toEqual(["w1"]);
    expect(of("capi-familie")).toEqual(["a1", "h1"]);
    expect(of("fara-familie")).toEqual(["n1", "p1", "r1", "t1", "t2"].concat("c4").sort());
    expect(of("iesiti")).toEqual(["x1"]);
    expect(of("nebotezati").length + of("botezati").length).toBe(of("toti").length);
    // Every listed key is known; age keys beyond the menu work too.
    for (const c of CATEGORIES) expect(ctx.ids(c.key), c.key).not.toBeNull();
    expect(categoryDef("varsta-5-9")?.label).toBe("5–9 ani");
    expect(ctx.ids("nimic")).toBeNull();
    // Union and intersection, in register order.
    expect(combineCategories(ctx, persons, ["copii-membri", "copii-apartinatori"])).toEqual(["c1", "c2", "c3"]);
    expect(combineCategories(ctx, persons, ["membri", "barbati", ageKey(18, 30)], "toate")).toEqual(["r1"]);
  });
});

describe("temporarily away (Statut art. 23 alin. 4–5)", () => {
  it("counts the persons away since more than 3 and 6 months", () => {
    const persons = [
      person({ id: "a", nume: "A", plecatDin: "2026-09-01" }),
      person({ id: "b", nume: "B", plecatDin: "2026-06-01" }),
      person({ id: "c", nume: "C", plecatDin: "2026-03-01" }),
      person({ id: "d", nume: "D", plecatDin: "2026-03-01", dataIesire: "2026-10-01", statut: "FOST_MEMBRU" }),
    ];
    const ctx = categoryContext({ persons, events: [], today: "2026-11-01", committee: new Set(), heads: new Set(), holders: new Map() });
    expect(ctx.ids("plecati-temporar")).toEqual(["a", "b", "c"]);
    expect(ctx.ids("plecati-3-luni")).toEqual(["b", "c"]);
    expect(ctx.ids("plecati-6-luni")).toEqual(["c"]);
  });
});

describe("consent categories", () => {
  it("split the persons by their current answer (a withdrawal counts as Nu)", () => {
    const persons = [person({ id: "a", nume: "A" }), person({ id: "b", nume: "B" }), person({ id: "c", nume: "C" }), person({ id: "d", nume: "D" })];
    const consents = new Map<string, Partial<Record<"INFO_NOTE" | "PHOTOS", "DA" | "NU" | "RETRAS" | "NEEXPRIMAT">>>([
      ["a", { INFO_NOTE: "DA", PHOTOS: "DA" }],
      ["b", { INFO_NOTE: "DA", PHOTOS: "NU" }],
      ["c", { PHOTOS: "RETRAS" }],
    ]);
    const ctx = categoryContext({ persons, events: [], today: "2026-11-01", committee: new Set(), heads: new Set(), holders: new Map(), consents });
    expect(ctx.ids("nota-confirmata")).toEqual(["a", "b"]);
    expect(ctx.ids("nota-neconfirmata")).toEqual(["c", "d"]);
    expect(ctx.ids("acord-photos-da")).toEqual(["a"]);
    expect(ctx.ids("acord-photos-nu")).toEqual(["b", "c"]);
    expect(ctx.ids("acord-photos-neexprimat")).toEqual(["d"]);
    expect(ctx.ids("acord-birthday-neexprimat")).toEqual(["a", "b", "c", "d"]);
  });
});
