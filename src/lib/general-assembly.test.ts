import { describe, expect, it } from "vitest";
import { assemblyLine, attendanceLines, convocationWarning, isGeneralAssembly, minutesAttendance, ordinaryAssemblyMissing, storedVotes, voteAdopted, voteLine, votesField } from "./general-assembly";

describe("General Assembly (Statut art. 46)", () => {
  it("recognises the AG types", () => {
    expect(isGeneralAssembly("Adunare generală", [])).toBe(true);
    expect(isGeneralAssembly("adunare generala", [])).toBe(true);
    expect(isGeneralAssembly("Comitet", [])).toBe(false);
    expect(isGeneralAssembly("Adunare anuală", ["Adunare anuală"])).toBe(true);
    expect(isGeneralAssembly("Adunare generală", ["Adunare anuală"])).toBe(false);
  });

  it("warns when announced less than 14 days before (7 when convened by the Comunitate)", () => {
    expect(convocationWarning("2026-11-20", "2026-11-10", false)).toContain("Statut art. 46 alin. 1: Adunarea Generală se anunță cu cel puțin două săptămâni înainte, precizându-se scopul.");
    expect(convocationWarning("2026-11-20", "2026-11-05", false)).toBeNull();
    expect(convocationWarning("2026-11-20", null, false)).toContain("nu este completată");
    expect(convocationWarning("2026-11-20", "2026-11-12", true)).toBeNull();
    expect(convocationWarning("2026-11-20", "2026-11-15", true)).toContain("art. 461");
  });

  it("writes the attendance line without a quorum", () => {
    expect(assemblyLine(40, 23, "2026-11-01", "2026-11-16")).toBe("Membri cu drepturi depline: 40 · prezenți: 23 · convocată la 1 noiembrie 2026 (15 zile înainte)");
    const ag = attendanceLines({ tip: "Adunare generală", tipuriAG: [], tipuriCvorum: [], asteptati: 20, present: 12, absent: 8, convocatLa: null, date: "2026-11-16" });
    expect(ag).toEqual({ adunare: "Membri cu drepturi depline: 20 · prezenți: 12", cvorum: null });
    expect(attendanceLines({ tip: "Comitet", tipuriAG: [], tipuriCvorum: [], asteptati: 7, present: 5, absent: 2, convocatLa: null, date: "2026-11-16" })).toEqual({ adunare: null, cvorum: null });
    expect(attendanceLines({ tip: "Comitet", tipuriAG: [], tipuriCvorum: ["Comitet"], asteptati: 7, present: 5, absent: 2, convocatLa: null, date: "2026-11-16" }).cvorum).toBe("Prezenți 5 din 7 (71 %)");
  });

  it("adopts by half plus one of those present (AG, committee), else by more for than against", () => {
    expect(voteAdopted({ pentru: 12, contra: 3, abtineri: 1, secret: false }, 20, "AG")).toBe(true);
    expect(voteAdopted({ pentru: 10, contra: 9, abtineri: 1, secret: false }, 20, "AG")).toBe(false);
    expect(voteAdopted({ pentru: 4, contra: 3, abtineri: 0, secret: false }, 7, "COMITET")).toBe(true);
    expect(voteAdopted({ pentru: 3, contra: 2, abtineri: 2, secret: false }, 7, "SIMPLA")).toBe(true);
    expect(voteLine({ pentru: 12, contra: 3, abtineri: 1, secret: true }, 20, "AG")).toBe("Votat: pentru 12, contra 3, abțineri 1 — adoptat (vot secret)");
    expect(voteLine({ pentru: 10, contra: 9, abtineri: 1, secret: false }, 20, "AG")).toBe("Votat: pentru 10, contra 9, abțineri 1 — respins");
  });

  it("reads the votes field and refuses bad numbers", () => {
    expect(votesField.parse(JSON.stringify([null, { pentru: 1, contra: 0, abtineri: 0, secret: false }]))).toEqual([null, { pentru: 1, contra: 0, abtineri: 0, secret: false }]);
    expect(votesField.parse(JSON.stringify([null, null]))).toBeNull();
    expect(votesField.safeParse(JSON.stringify([{ pentru: -1, contra: 0, abtineri: 0 }])).success).toBe(false);
  });

  it("misses the ordinary AG from 1 October when none was held", () => {
    expect(ordinaryAssemblyMissing("2026-09-30", 0)).toBe(false);
    expect(ordinaryAssemblyMissing("2026-10-01", 0)).toBe(true);
    expect(ordinaryAssemblyMissing("2026-10-01", 1)).toBe(false);
  });
});

describe("minutesAttendance", () => {
  const church = { tipuriAG: [], tipuriCvorum: ["Frați slujitori"], attendanceRules: { Comitet: "COMITET" } };
  const base = { data: "2026-03-15", asteptati: 10, present: 6, absent: 4, convocatLa: "2026-03-01", voturi: null };
  it("AG: the assembly line, no quorum; votes by half plus one of those present", () => {
    const r = minutesAttendance({ ...base, tip: "Adunare generală", voturi: [{ pentru: 3, contra: 2, abtineri: 1, secret: false }] }, church);
    expect(r.cvorum).toBeNull();
    expect(r.adunare).toBe("Membri cu drepturi depline: 10 · prezenți: 6 · convocată la 1 martie 2026 (14 zile înainte)");
    expect(r.voturi).toEqual(["Votat: pentru 3, contra 2, abțineri 1 — respins"]);
  });
  it("quorum only for the types ticked; simple majority elsewhere", () => {
    expect(minutesAttendance({ ...base, tip: "Comitet" }, church).cvorum).toBeNull();
    expect(minutesAttendance({ ...base, tip: "Frați slujitori" }, church).cvorum).toBe("Prezenți 6 din 10 (60 %)");
    expect(minutesAttendance({ ...base, tip: "Altele", voturi: [{ pentru: 3, contra: 2, abtineri: 1, secret: true }] }, church).voturi).toEqual([
      "Votat: pentru 3, contra 2, abțineri 1 — adoptat (vot secret)",
    ]);
  });
  it("storedVotes drops malformed JSON", () => {
    expect(storedVotes([{ pentru: 1, contra: 0, abtineri: 0 }, null])).toEqual([{ pentru: 1, contra: 0, abtineri: 0, secret: false }, null]);
    expect(storedVotes([null])).toBeNull();
    expect(storedVotes({ x: 1 })).toBeNull();
  });
});
