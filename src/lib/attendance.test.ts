import { describe, expect, it } from "vitest";
import { absentees, attendanceRule, attendanceRulesText, attendanceText, parseAttendanceRules, quorumLine, resolveAttendanceRules } from "./attendance";

describe("attendance rules", () => {
  it("uses the defaults for the standard types and Manual for the rest", () => {
    expect(attendanceRule("Adunare generală", {})).toBe("TOTI");
    expect(attendanceRule("Comitet", {})).toBe("COMITET");
    expect(attendanceRule("Frați slujitori", {})).toBe("COMITET");
    expect(attendanceRule("Altele", {})).toBe("MANUAL");
  });

  it("lets the saved rules override the defaults and drops invalid entries", () => {
    const saved = parseAttendanceRules({ Comitet: "MANUAL", Diaconie: "COMITET", Altele: "ORICE", x: 3 });
    expect(saved).toEqual({ Comitet: "MANUAL", Diaconie: "COMITET" });
    expect(resolveAttendanceRules(["Comitet", "Diaconie", "Adunare generală", "Altele"], saved)).toEqual({
      Comitet: "MANUAL",
      Diaconie: "COMITET",
      "Adunare generală": "TOTI",
      Altele: "MANUAL",
    });
    expect(parseAttendanceRules(null)).toEqual({});
    expect(parseAttendanceRules(["TOTI"])).toEqual({});
  });

  it("describes the rules for the audit log", () => {
    expect(attendanceRulesText({ "Adunare generală": "TOTI", Comitet: "COMITET", Altele: "MANUAL" })).toBe(
      "Adunare generală: Toți membrii; Comitet: Comitetul",
    );
  });
});

describe("absentees and quorum", () => {
  it("absentees are the expected persons not present", () => {
    expect(absentees(["a", "b", "c", "c"], ["b", "x"])).toEqual(["a", "c"]);
    expect(absentees([], ["a"])).toEqual([]);
  });

  it("quorum line", () => {
    expect(quorumLine(15, 3)).toBe("Prezenți 12 din 15 (80 %)");
    expect(quorumLine(3, 1)).toBe("Prezenți 2 din 3 (67 %)");
    expect(quorumLine(5, 0)).toBe("Prezenți 5 din 5 (100 %)");
    expect(quorumLine(0, 0)).toBeNull();
    expect(quorumLine(null, 2)).toBeNull();
  });

  it("attendance text has the count and the names", () => {
    expect(attendanceText(["Ana Pop", "Ion Pop"])).toBe("(2) Ana Pop, Ion Pop");
    expect(attendanceText([])).toBe("");
  });
});
