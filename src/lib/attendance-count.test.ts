import { describe, expect, it } from "vitest";
import { meetingPrint, printToText } from "@/domain/print";
import { parseMinutesText } from "@/domain/minutes-parse";
import { consecutiveUnexcused } from "./committee";
import { attendanceMode, countAboveExpected, countOnModeChange, presentCount, quorumLine, shownAbsentees, votesOverPresent } from "./attendance";
import { minutesAttendance } from "./general-assembly";
import { meetingSchema } from "./schemas/meeting";

const church = { nume: "Biserica Test", adresa: "", codPostal: "", localitate: "", orgNr: "", telefon: "", email: "", pastor: "Pop Ion", secretar: "Rusu Ana" } as never;
const rules = { tipuriAG: [], tipuriCvorum: ["Comitet"], attendanceRules: { "Adunare generală": "TOTI", Comitet: "COMITET" } };

/** ATTENDANCE-COUNT: the attendance recorded only as a number. */
describe("ATTENDANCE-COUNT", () => {
  it("presentCount: the number, else the ticks; no absentees by number", () => {
    expect(presentCount({ numarPrezenti: 30, present: 4 })).toBe(30);
    expect(presentCount({ numarPrezenti: null, present: 4 })).toBe(4);
    expect(presentCount({ numarPrezenti: 0, present: 4 })).toBe(0);
    expect(shownAbsentees(7, ["a", "b"])).toEqual([]);
    expect(shownAbsentees(null, ["a", "b"])).toEqual(["a", "b"]);
    expect([attendanceMode(null), attendanceMode(0)]).toEqual(["nume", "numar"]);
  });

  it("the mode switch: by name → by number starts at the ticks, back by name clears it", () => {
    expect(countOnModeChange("numar", 9)).toBe("9");
    expect(countOnModeChange("nume", 9)).toBe("");
    expect(countOnModeChange("numar", 0)).toBe("0");
  });

  it("more than expected: a warning only", () => {
    expect(countAboveExpected(12, 10)).toBe("Mai mulți decât cei așteptați (10). Verificați.");
    expect(countAboveExpected(10, 10)).toBeNull();
    expect(countAboveExpected(12, null)).toBeNull();
    expect(countAboveExpected(null, 10)).toBeNull();
  });

  it("the General Assembly with 30: the AG line with 30, votes above 30 refused", () => {
    const m = { tip: "Adunare generală", data: "2026-03-15", asteptati: 40, present: 0, absent: 0, numarPrezenti: 30, convocatLa: "2026-03-01", voturi: [{ pentru: 20, contra: 5, abtineri: 5, secret: false }] };
    const lines = minutesAttendance(m, rules);
    expect(lines.adunare).toBe("Membri cu drepturi depline: 40 · prezenți: 30 · convocată la 1 martie 2026 (14 zile înainte)");
    expect(lines.voturi).toEqual(["Votat: pentru 20, contra 5, abțineri 5 — adoptat"]);
    expect(votesOverPresent(m.voturi, 30, true)).toBeNull();
    expect(votesOverPresent([null, { pentru: 25, contra: 5, abtineri: 1 }], 30, true)).toBe("Punctul 2: 31 voturi, mai multe decât prezenții (30).");
    // By name with nobody ticked the attendance is unknown: not checked.
    expect(votesOverPresent([{ pentru: 25, contra: 5, abtineri: 1 }], 0, false)).toBeNull();
  });

  it("the quorum uses the number", () => {
    expect(quorumLine(10, 7)).toBe("Prezenți 7 din 10 (70 %)");
    expect(minutesAttendance({ tip: "Comitet", data: "2026-03-15", asteptati: 10, present: 0, absent: 0, numarPrezenti: 7, convocatLa: null, voturi: null }, rules).cvorum).toBe("Prezenți 7 din 10 (70 %)");
    // By name: the expected not absent, as before.
    expect(minutesAttendance({ tip: "Comitet", data: "2026-03-15", asteptati: 10, present: 9, absent: 2, convocatLa: null, voturi: null }, rules).cvorum).toBe("Prezenți 8 din 10 (80 %)");
  });

  it("the minutes by number: „Prezenți: 7”, no names, no „Absenți”; the AG line alone for an AG", () => {
    const base = { nr: 4, data: "2026-03-15", absenti: [], invitati: "", ordine: "", puncte: ["Bugetul"], observatii: "", formulaIncheiere: "Gata." };
    const text = printToText(meetingPrint({ ...base, tip: "Comitet", prezenti: [], numarPrezenti: 7 }, church));
    expect(text).toContain("Prezenți: 7");
    expect(text).not.toContain("Absenți");
    expect(text).not.toContain("La ședință au fost prezenți");
    const ag = printToText(meetingPrint({ ...base, tip: "Adunare generală", prezenti: [], numarPrezenti: 30, adunare: "Membri cu drepturi depline: 40 · prezenți: 30" }, church));
    expect(ag).toContain("Membri cu drepturi depline: 40 · prezenți: 30");
    expect(ag).not.toContain("Prezenți: 30");
    // By name: unchanged.
    const named = printToText(meetingPrint({ ...base, tip: "Comitet", prezenti: [{ nume: "Pop", prenume: "Ana" }], absenti: [{ nume: "Rusu", prenume: "Dan" }] }, church));
    expect(named).toContain("La ședință au fost prezenți: 1 membru.");
    expect(named).toContain("Absenți: Rusu Dan");
  });

  it("the form's schema: by number the names are dropped and the number is required", () => {
    const base = { tip: "Comitet", data: "2026-03-15", titlu: "", ora: "", loc: "", presedinte: "", invitati: "", ordine: "", observatii: "", formulaIncheiere: "", convocareText: "" };
    const byNumber = meetingSchema.parse({ ...base, prezenti: ["abc"], modPrezenta: "numar", numarPrezenti: "7" });
    expect([byNumber.prezenti, byNumber.numarPrezenti]).toEqual([[], 7]);
    const byName = meetingSchema.parse({ ...base, prezenti: ["abc"], modPrezenta: "nume", numarPrezenti: "7" });
    expect([byName.prezenti, byName.numarPrezenti]).toEqual([["abc"], null]);
    expect(meetingSchema.safeParse({ ...base, prezenti: [], modPrezenta: "numar", numarPrezenti: "" }).error?.issues[0].message).toBe("Scrieți numărul de prezenți.");
    expect(meetingSchema.safeParse({ ...base, prezenti: [], modPrezenta: "numar", numarPrezenti: "-3" }).success).toBe(false);
  });

  it("art. 45: a meeting by number has no rows, so the streak only counts the meetings by name", () => {
    // Newest first: absent, (by number: no row), absent, absent → 3 in a row, the number meeting neither breaks nor adds.
    const rows = [
      { status: "ABSENT" as const, motivat: false },
      { status: "ABSENT" as const, motivat: false },
      { status: "ABSENT" as const, motivat: false },
      { status: "PRESENT" as const, motivat: false },
    ];
    expect(consecutiveUnexcused(rows)).toBe(3);
  });

  it("the Word import reads the number of those present", () => {
    const { draft } = parseMinutesText("Proces verbal nr. 3\nÎncheiat azi, 12.03.2024, cu ocazia ședinței de comitet.\nLa ședință au fost prezenți: 23 de membri.\n\nÎn cadrul ședinței s-au discutat și aprobat următoarele:\n1. Bugetul\nToate punctele au fost votate în unanimitate.");
    expect(draft.numarPrezenti).toBe(23);
  });
});
