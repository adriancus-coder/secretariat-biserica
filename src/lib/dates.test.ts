import { describe, expect, it } from "vitest";
import { addMonths, ageAt, fromDbDate, inYear, isIsoDate, toDbDate, todayIso, weekdayMondayFirst } from "./dates";
import { fmt, fmtL, memberName } from "./format";

describe("date ISO", () => {
  it("validează datele reale", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(isIsoDate("2024-13-01")).toBe(false);
    expect(isIsoDate("2024-1-01")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("calculează vârsta împlinită", () => {
    expect(ageAt("2000-03-15", "2025-03-14")).toBe(24);
    expect(ageAt("2000-03-15", "2025-03-15")).toBe(25);
    expect(ageAt("2000-02-29", "2025-02-28")).toBe(24);
    expect(ageAt("2000-02-29", "2025-03-01")).toBe(25);
  });

  it("inYear se comportă ca în prototip", () => {
    expect(inYear("2025-06-01", 2025)).toBe(true);
    expect(inYear("2025-06-01", "2024")).toBe(false);
    expect(inYear(null, 2025)).toBe(false);
  });

  it("conversia din/în coloana date este stabilă", () => {
    expect(fromDbDate(toDbDate("1990-03-01"))).toBe("1990-03-01");
    expect(toDbDate(null)).toBeNull();
    expect(fromDbDate(null)).toBeNull();
  });

  it("azi în fusul orar al aplicației", () => {
    const d = new Date("2026-09-28T22:30:00Z");
    expect(todayIso("Europe/Bucharest", d)).toBe("2026-09-29");
    expect(todayIso("UTC", d)).toBe("2026-09-28");
  });

  it("aritmetica lunilor și ziua săptămânii", () => {
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
    expect(weekdayMondayFirst(2026, 8, 28)).toBe(0); // luni
    expect(weekdayMondayFirst(2026, 8, 27)).toBe(6); // duminică
  });
});

describe("formatări", () => {
  it("fmt și fmtL", () => {
    expect(fmt("2020-03-05")).toBe("5 mar 2020");
    expect(fmt("")).toBe("—");
    expect(fmtL("2020-03-05")).toBe("5 martie 2020");
    expect(fmtL(null)).toBe("____________");
  });

  it("memberName", () => {
    expect(memberName({ nume: "Pop", prenume: "Ion" })).toBe("Pop Ion");
    expect(memberName({ nume: "Pop", prenume: "" })).toBe("Pop");
  });
});
