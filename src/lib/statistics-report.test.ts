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
    byStatus: [{ key: "membri", label: "Membri", M: 20, F: 21, total: 41 }],
    families: { count: 10, avgSize: 3.2, withMinors: 4, alone: 2, withoutFamily: 5 },
  },
};

describe("statistics report", () => {
  it("builds the tables with the same numbers as the page", () => {
    const [evo, months, ages, , fam] = statisticsTables(report);
    expect(evo.rows[1].slice(0, 3)).toEqual([2025, 41, 2]);
    expect(months.rows[2]).toEqual(["martie", 3, 0]);
    expect(ages.rows).toEqual([["0–13", 2, 3, 5], ["65+", 1, 0, 1]]);
    expect(fam.rows[1]).toEqual(["Persoane pe familie, în medie", "3,2"]);
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
});
