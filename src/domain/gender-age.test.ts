import { describe, expect, it } from "vitest";
import { genderAgeParams, genderAgeTitle, parseGenderAge } from "@/lib/category-params";
import { categoryContext, CATEGORIES, filterGenderAge, genderAgeCounts, genderAgeTable, isMinorAt, type AgeFilter, type GenderFilter } from "./categories";
import { person } from "./test-helpers";

const TODAY = "2026-10-25";
const persons = [
  person({ nume: "Pop", id: "m1", gen: "M", dataNasterii: "1980-01-01", dataMembru: "2000-01-01", dataBotez: "1999-01-01" }),
  person({ nume: "Pop", id: "m2", gen: "M", statut: "APARTINATOR", dataNasterii: "2012-05-05" }),
  person({ nume: "Pop", id: "f1", gen: "F", dataNasterii: "1985-01-01", dataMembru: "2005-01-01", dataBotez: "2004-01-01" }),
  person({ nume: "Pop", id: "f2", gen: "F", statut: "APARTINATOR", dataNasterii: "2015-01-01" }),
  person({ nume: "Pop", id: "f3", gen: "F", statut: "APARTINATOR", dataNasterii: "2008-10-25" }), // 18 today: an adult
  person({ nume: "Pop", id: "f4", gen: "F", statut: "PRIETEN" }), // no birth date: an adult
  person({ nume: "Pop", id: "x1", gen: null, statut: "PRIETEN", dataNasterii: "2016-01-01" }),
  person({ nume: "Pop", id: "x2", gen: null, statut: "PRIETEN", dataNasterii: "1970-01-01" }),
];
const ids = (l: { id: string }[]) => l.map((p) => p.id);

describe("GENDER-AGE-FILTERS", () => {
  it("a minor is under 18 at the reference date; no birth date = an adult", () => {
    expect(isMinorAt({ dataNasterii: "2008-10-26" }, TODAY)).toBe(true);
    expect(isMinorAt({ dataNasterii: "2008-10-25" }, TODAY)).toBe(false);
    expect(isMinorAt({ dataNasterii: null }, TODAY)).toBe(false);
  });

  it("the sums: men + women + without gender = total; adults + minors = total, for every age and gender choice", () => {
    for (const varsta of ["toti", "adulti", "minori"] as AgeFilter[]) {
      const c = genderAgeCounts(persons, { gen: "toti", varsta }, TODAY);
      expect(c.gen.M + c.gen.F + c.faraGen).toBe(c.gen.toti);
    }
    for (const gen of ["toti", "M", "F", "fara"] as GenderFilter[]) {
      const c = genderAgeCounts(persons, { gen, varsta: "toti" }, TODAY);
      expect(c.varsta.adulti + c.varsta.minori).toBe(c.varsta.toti);
    }
    const t = genderAgeTable(persons, TODAY);
    expect(t.rows.map((r) => [r.gen, r.adulti, r.minori, r.total])).toEqual([
      ["M", 1, 1, 2],
      ["F", 3, 1, 4],
      ["fara", 1, 1, 2],
    ]);
    expect(t.total).toEqual({ adulti: 5, minori: 3, total: 8 });
    expect(t.rows.reduce((s, r) => s + r.total, 0)).toBe(t.total.total);
    // The row „fără gen” only when there are any.
    expect(genderAgeTable(persons.filter((p) => p.gen), TODAY).rows.map((r) => r.gen)).toEqual(["M", "F"]);
  });

  it("persons without a gender only under „Toți” (and their own link)", () => {
    expect(ids(filterGenderAge(persons, { gen: "M", varsta: "toti" }, TODAY))).toEqual(["m1", "m2"]);
    expect(ids(filterGenderAge(persons, { gen: "F", varsta: "minori" }, TODAY))).toEqual(["f2"]);
    expect(ids(filterGenderAge(persons, { gen: "toti", varsta: "minori" }, TODAY))).toEqual(["m2", "f2", "x1"]);
    expect(ids(filterGenderAge(persons, { gen: "fara", varsta: "toti" }, TODAY))).toEqual(["x1", "x2"]);
    const c = genderAgeCounts(persons, { gen: "F", varsta: "minori" }, TODAY);
    // Each group counts under the other's choice: the gender buttons among minors, the age buttons among women.
    expect(c.gen).toEqual({ toti: 3, M: 1, F: 1 });
    expect(c.faraGen).toBe(1);
    expect(c.varsta).toEqual({ toti: 4, adulti: 3, minori: 1 });
  });

  it("combined with any category, at the category's reference date", () => {
    for (const year of [undefined, 2020]) {
      const ctx = categoryContext({ persons, events: [], today: TODAY, year, committee: new Set(), heads: new Set(), holders: new Map() });
      const ref = ctx.stats.endDate;
      for (const def of CATEGORIES) {
        const list = ctx.ids(def.key);
        if (!list) continue;
        const inCat = persons.filter((p) => list.includes(p.id));
        const parts = (["M", "F", "fara"] as GenderFilter[]).map((gen) => filterGenderAge(inCat, { gen, varsta: "toti" }, ref).length);
        expect(parts.reduce((a, b) => a + b, 0), def.key).toBe(inCat.length);
        const ages = (["adulti", "minori"] as AgeFilter[]).map((varsta) => filterGenderAge(inCat, { gen: "toti", varsta }, ref).length);
        expect(ages[0] + ages[1], def.key).toBe(inCat.length);
      }
      // „Copii minori” are all minors; „Bărbați” are all men.
      const minors = persons.filter((p) => ctx.ids("copii-minori")!.includes(p.id));
      expect(filterGenderAge(minors, { gen: "toti", varsta: "adulti" }, ref)).toEqual([]);
      const men = persons.filter((p) => ctx.ids("barbati")!.includes(p.id));
      expect(filterGenderAge(men, { gen: "F", varsta: "toti" }, ref)).toEqual([]);
    }
  });

  it("the URL keeps the filters; unknown values mean everybody; the title follows them", () => {
    const sp = new URLSearchParams("categorie=apartinatori&gen=F&varsta=minori");
    const f = parseGenderAge((k) => sp.get(k));
    expect(f).toEqual({ gen: "F", varsta: "minori" });
    expect(genderAgeParams(f)).toEqual({ gen: "F", varsta: "minori" });
    expect(parseGenderAge((k) => ({ gen: "X", varsta: ["minori", "adulti"] })[k])).toEqual({ gen: "toti", varsta: "minori" });
    expect(genderAgeParams({ gen: "toti", varsta: "toti" })).toEqual({});
    expect(genderAgeTitle("Aparținători", f)).toBe("Aparținători · femei · minori");
    expect(genderAgeTitle("Membri", { gen: "toti", varsta: "toti" })).toBe("Membri");
  });
});
