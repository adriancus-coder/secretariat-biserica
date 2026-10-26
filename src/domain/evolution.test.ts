import { describe, expect, it } from "vitest";
import { categoryContext, type CategoryInput } from "./categories";
import { byMonth, evolution, structure } from "./evolution";
import { person } from "./test-helpers";

const TODAY = "2026-10-25";
const persons = [
  person({ id: "a", nume: "A", gen: "M", dataNasterii: "1980-01-01", dataMembru: "2015-03-01", modIntrare: "BOTEZ", dataBotez: "2015-03-01", familyId: "f1" }),
  person({ id: "b", nume: "B", gen: "F", dataNasterii: "1982-01-01", dataMembru: "2024-05-01", modIntrare: "TRANSFER", familyId: "f1" }),
  person({ id: "c", nume: "C", gen: "F", statut: "APARTINATOR", dataNasterii: "2016-01-01", familyId: "f1", dataBinecuvantare: "2016-06-01" }),
  person({ id: "d", nume: "D", gen: "M", dataNasterii: "1950-01-01", dataMembru: "1990-01-01", statut: "FOST_MEMBRU", dataIesire: "2025-02-02", modIesire: "DECES" }),
  person({ id: "e", nume: "E", gen: "M", dataNasterii: "2000-01-01", dataMembru: "2026-04-10", modIntrare: "CERERE_MEMBRALITATE", familyId: "f2" }),
  person({ id: "g", nume: "G", gen: "F" }),
];
const input: Omit<CategoryInput, "year"> = { persons, events: [], today: TODAY, committee: new Set(), heads: new Set(), holders: new Map() };

describe("statistics page", () => {
  it("each evolution figure is the size of its category for that year; growth follows the members", () => {
    const rows = evolution(input, 2026, 10);
    expect(rows.map((r) => r.year)).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    for (const r of rows) {
      const ctx = categoryContext({ ...input, year: r.an });
      expect(r.membri).toBe(ctx.ids("membri")!.length);
      expect(r.iesiri.total).toBe(ctx.ids("iesiti-an")!.length);
    }
    const y = (n: number) => rows.find((r) => r.year === n)!;
    expect(y(2024).intrari.transfer).toBe(1);
    expect(y(2025).iesiri.deces).toBe(1);
    expect(y(2026).intrari.cerere).toBe(1);
    expect(y(2026).an).toBeUndefined();
    expect(y(2025).crestere).toBe(y(2025).membri - y(2024).membri);
  });

  it("entries and exits by month", () => {
    expect(byMonth(persons, 2026)[3]).toEqual({ month: 4, intrari: 1, iesiri: 0 });
    expect(byMonth(persons, 2025)[1]).toEqual({ month: 2, intrari: 0, iesiri: 1 });
  });

  it("the pyramid sums to the persons with a birth date and a gender; families", () => {
    const st = structure(input);
    const inRecord = categoryContext(input).stats.ev;
    expect(st.pyramid.reduce((a, b) => a + b.M + b.F, 0) + st.withoutGender).toBe(inRecord.filter((p) => p.dataNasterii).length);
    expect(st.withoutBirthDate).toBe(1);
    expect(st.families).toEqual({ count: 2, withoutMembers: 0, avgSize: 2, withMinors: 1, alone: 1, withoutFamily: 1 });
    expect(st.ageMedian).toBe(st.ageAvg !== null ? st.ageMedian : null);
  });
});
