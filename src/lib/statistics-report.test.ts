import { describe, expect, it } from "vitest";
import { printToText } from "@/domain/print";
import type { YearRow } from "@/domain/evolution";
import { evolutionText, statisticsPrint, statisticsTables, type StatisticsReport } from "./statistics-report";

const row = (year: number, membri: number, crestere: number): YearRow => ({
  year,
  an: year,
  membri,
  intrari: { botez: 2, transfer: 1, cerere: 0, reprimire: 0 },
  iesiri: { transfer: 1, retragere: 0, deces: 1, excludere: 0, total: 2 },
  binecuvantari: 3,
  crestere,
});

const report: StatisticsReport = {
  today: "2026-10-25",
  year: 2025,
  an: 2025,
  rows: [row(2024, 40, 1), row(2025, 41, 1)],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, intrari: i === 2 ? 3 : 0, iesiri: 0 })),
  structure: {
    pyramid: [{ min: 0, max: 13, M: 2, F: 3 }, { min: 65, max: 200, M: 1, F: 0 }],
    withoutBirthDate: 4,
    withoutGender: 0,
    ageAvg: 41.5,
    ageMedian: 40,
    bands: [{ min: 0, max: 13, n: 5 }, { min: 65, max: 200, n: 1 }],
    byStatus: [{ key: "membri", label: "Membri", M: 20, F: 21, total: 41, casatoriti: 30, necasatoriti: 5 }],
    marital: { adulti: 50, casatoriti: 30, necasatoriti: 8, necompletat: 12 },
    children: { total: 7, members: 5, others: 2 },
    families: { count: 10, withoutMembers: 1, avgSize: 3.2, withMinors: 4, alone: 2, withoutFamily: 5 },
    genderAge: {
      rows: [
        { gen: "M", adulti: 18, minori: 3, total: 21 },
        { gen: "F", adulti: 19, minori: 4, total: 23 },
        { gen: "fara", adulti: 1, minori: 0, total: 1 },
      ],
      total: { adulti: 38, minori: 7, total: 45 },
    },
  },
};

describe("statistics report", () => {
  it("the exports follow the screen's sort for that table only", () => {
    const [evo, , ages] = statisticsTables(report, { sort: "evolutie.membri", dir: "asc" });
    expect(evo.rows.map((r) => r[1])).toEqual([40, 41]);
    expect(ages.rows.map((r) => r[0])).toEqual(["0–13", "65+"]);
    const [, , ages2] = statisticsTables(report, { sort: "varste.total", dir: "desc" });
    expect(ages2.rows.map((r) => r[3])).toEqual([5, 1]);
    const spec = printToText(statisticsPrint(report, { nume: "B", adresa: "", orgNr: "", telefon: "", email: "", pastor: "", secretar: "" }, { sort: "evolutie.an", dir: "asc" }));
    expect(spec.indexOf("2024 | 40")).toBeLessThan(spec.indexOf("2025 | 41"));
  });

  it("builds the tables with the same numbers as the page", () => {
    const [evo, months, ages, , , fam] = statisticsTables(report);
    // Year tables: newest first by default.
    expect(evo.rows.map((r) => r[0])).toEqual([2025, 2024]);
    expect(evo.rows[0].slice(0, 3)).toEqual([2025, 41, 2]);
    expect(months.rows[2]).toEqual(["martie", 3, 0]);
    expect(ages.rows).toEqual([["0–13", 2, 3, 5], ["65+", 1, 0, 1]]);
    expect(fam.rows[0]).toEqual(["Familii ale bisericii", 10]);
    expect(fam.rows[1]).toEqual(["Alte familii în evidență", 1]);
    expect(fam.rows[2]).toEqual(["Persoane pe familie, în medie", "3,2"]);
    // MINORS-OTHER-FAMILIES: the children's rows, the two parts adding up to the total.
    expect(fam.rows.slice(4, 7)).toEqual([["Copii minori", 7], ["Copii ai membrilor", 5], ["Copii din alte familii", 2]]);
  });

  it("prints the charts as tables in printToText, with the missing birth dates", () => {
    const text = printToText(statisticsPrint(report, { nume: "Test" } as never));
    expect(text).toContain("Membri la sfârșitul fiecărui an\n | Membri\n2024 | 40\n2025 | 41");
    expect(text).toContain("Piramida vârstelor\n | Bărbați | Femei\n0–13 | 2 | 3");
    expect(text).toContain("4 persoane fără dată de naștere nu sunt incluse.");
  });

  it("writes the 5-year table of the dare de seamă", () => {
    expect(evolutionText(report.rows)).toBe(
      "Evoluția pe 2 ani\nAn | Membri | Intrări | Ieșiri | Binecuvântări | Creștere netă\n2024 | 40 | 3 | 2 | 3 | +1\n2025 | 41 | 3 | 2 | 3 | +1",
    );
  });

  it("the status table has the married / unmarried columns and the families table the adults by marital status", () => {
    const [, , , status, , families] = statisticsTables(report);
    expect(status.columns).toEqual(["Statut", "Bărbați", "Femei", "Total", "Căsătoriți", "Necăsătoriți"]);
    expect(status.rows[0]).toEqual(["Membri", 20, 21, 41, 30, 5]);
    const row = (label: string) => families.rows.find((r) => r[0] === label)?.[1];
    expect([row("Adulți în evidență"), row("Adulți căsătoriți"), row("Adulți necăsătoriți"), row("Adulți cu starea civilă necompletată")]).toEqual([50, 30, 8, 12]);
  });

  it("GENDER-AGE-FILTERS: „Gen și vârstă” in the PDF and Excel tables, the total last whatever the sort", () => {
    const t = statisticsTables(report, { sort: "gen-varsta.total", dir: "asc" })[4];
    expect(t.name).toBe("Gen și vârstă");
    expect(t.columns).toEqual(["Gen", "Adulți", "Minori", "Total"]);
    expect(t.rows).toEqual([
      ["Fără gen completat", 1, 0, 1],
      ["Bărbați", 18, 3, 21],
      ["Femei", 19, 4, 23],
      ["Total", 38, 7, 45],
    ]);
    expect(printToText(statisticsPrint(report, { nume: "Test" } as never))).toContain("Gen și vârstă");
  });
});
