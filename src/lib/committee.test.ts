import { describe, expect, it } from "vitest";
import { addYears, consecutiveUnexcused, eligibilityWarnings, mandateEnd, mandateNotice, mandateState } from "./committee";

describe("committee mandate (Statut art. 45)", () => {
  it("lasts 5 years, 10 when extended once", () => {
    expect(mandateEnd("2022-03-15", false)).toBe("2027-03-15");
    expect(mandateEnd("2022-03-15", true)).toBe("2032-03-15");
    expect(addYears("2024-02-29", 5)).toBe("2029-02-28");
  });
  it("is reminded 6 months before the end and after it", () => {
    expect(mandateState("2026-09-14", "2022-03-15", false).state).toBe("ok");
    expect(mandateState("2026-09-15", "2022-03-15", false).state).toBe("soon");
    expect(mandateState("2027-03-15", "2022-03-15", false).state).toBe("expired");
    expect(mandateNotice("2026-10-25", "2022-03-15", false)).toBe("Mandatul comitetului expiră la 15 martie 2027 — Statut art. 45.");
    expect(mandateNotice("2027-04-01", "2022-03-15", true)).toBeNull();
    expect(mandateNotice("2026-10-25", null, false)).toBeNull();
  });
  it("warns about the eligibility dates", () => {
    const today = "2026-10-25";
    expect(eligibilityWarnings({ dataMembru: "2020-01-01", dataBotez: "2015-06-01", botezAn: 2015 }, today)).toEqual([]);
    const w = eligibilityWarnings({ dataMembru: "2025-01-01", dataBotez: null, botezAn: 2023 }, today);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatch(/mai puțin de 2 ani/);
    expect(w[1]).toMatch(/mai puțin de 5 ani/);
    expect(eligibilityWarnings({ dataMembru: null, dataBotez: null, botezAn: null }, today)).toHaveLength(2);
  });
  it("counts unexcused absences in a row", () => {
    const A = { status: "ABSENT" as const, motivat: false };
    expect(consecutiveUnexcused([A, A, A, A, A, { status: "PRESENT", motivat: false }])).toBe(5);
    expect(consecutiveUnexcused([A, A, { status: "ABSENT", motivat: true }, A, A])).toBe(2);
    expect(consecutiveUnexcused([])).toBe(0);
  });
});
