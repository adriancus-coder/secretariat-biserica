import { describe, expect, it } from "vitest";
import { printToText } from "@/domain/print";
import { appealDeadline, disciplinaryMinutesPrint, hearingConvocationPrint, sanctionNoticePrint } from "./discipline-print";
import { closingErrors } from "./schemas/discipline";

const church = { nume: "Maranata", adresa: "Str. 1", orgNr: "", telefon: "", email: "", pastor: "Daniel Mureșan", secretar: "Ioana Pop" };
const person = { nume: "Pop", prenume: "Ana", gen: "F" as const };

describe("disciplinary documents (Statut art. 27, 272)", () => {
  it("the hearing convocation names the date, time, place and art. 272 lit. a–b", () => {
    const t = printToText(hearingConvocationPrint({ person, data: "2026-11-05", ora: "18:00", loc: "", today: "2026-10-25" }, church));
    expect(t).toContain("Sora Pop Ana,");
    expect(t).toContain("în data de 5 noiembrie 2026, ora 18:00, la sediul bisericii, Str. 1");
    expect(t).toContain("art. 272 lit. a");
    expect(t).toContain("neprezentarea nu împiedică desfășurarea procedurii");
  });

  it("the disciplinary minutes carry every art. 272 lit. c field and the appeal sentence", () => {
    const t = printToText(
      disciplinaryMinutesPrint(
        { person, sedinta: "procesul-verbal nr. 7/2026 din 12 martie 2026", abatere: "Fapta X", raspuns: "", nuSaPrezentat: true, sanctiune: "Suspendare", incadrare: "art. 27 alin. 13 lit. b", temei: "art. 27 alin. 3 lit. d", comunitate: "Comunitatea Oslo" },
        church,
      ),
    );
    for (const s of ["Abaterea constatată:", "Fapta X", "Nu s-a prezentat la audiere", "Sancțiunea: Suspendare.", "Încadrarea statutară: art. 27 alin. 13 lit. b.", "Temeiul statutar: art. 27 alin. 3 lit. d.", "Comunitatea Oslo în termen de 15 zile"]) {
      expect(t).toContain(s);
    }
  });

  it("the sanction notice computes the appeal deadline: communication + 15 days", () => {
    expect(appealDeadline("2026-10-25")).toBe("2026-11-09");
    const t = printToText(sanctionNoticePrint({ person, sanctiune: "Suspendare", sedinta: "", temei: "art. 27 alin. 3 lit. d", comunicatLa: "2026-10-25", comunitate: "" }, church));
    expect(t).toContain("până la data de 9 noiembrie 2026 inclusiv");
    expect(t).toContain("art. 27 alin. 10");
  });

  it("closing an investigation needs the minutes and the lit. c contents", () => {
    expect(Object.keys(closingErrors({ meetingId: null, abatere: "", raspuns: "", nuSaPrezentat: false, incadrare: "", temei: "" })).sort()).toEqual(
      ["abatere", "incadrare", "meetingId", "raspuns", "temei"],
    );
    expect(closingErrors({ meetingId: "m1", abatere: "x", raspuns: "", nuSaPrezentat: true, incadrare: "y", temei: "z" })).toEqual({});
  });
});
