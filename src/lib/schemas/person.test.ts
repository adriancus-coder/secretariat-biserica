import { describe, expect, it } from "vitest";
import { applyExitRule, personDateErrors, personSchema } from "./person";

const form = (over: Record<string, string> = {}) => ({ nume: "Popescu", prenume: "Ion", statut: "MEMBRU", ...over });

describe("validarea persoanei", () => {
  it("acceptă un formular minimal și normalizează valorile goale", () => {
    const r = personSchema.parse(form({ gen: "", dataNasterii: "", email: "  " }));
    expect(r.gen).toBeNull();
    expect(r.dataNasterii).toBeNull();
    expect(r.email).toBe("");
    expect(r.familyId).toBe("");
  });

  it("numele este obligatoriu; datele și e-mailul se validează", () => {
    const r = personSchema.safeParse(form({ nume: "  ", dataBotez: "2024-02-30", email: "nu-e-email", statut: "X" }));
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["nume", "dataBotez", "email", "statut"]));
  });

  it("regula din prototip: cu dată de ieșire, statutul devine „Fost membru” (mai puțin la deces)", () => {
    const base = personSchema.parse(form({ dataIesire: "2025-05-01", modIesire: "TRANSFER", bisericaDestinatie: "Betel Oslo" }));
    expect(applyExitRule(base).statut).toBe("FOST_MEMBRU");
    const deces = personSchema.parse(form({ dataIesire: "2025-05-01", modIesire: "DECES" }));
    expect(applyExitRule(deces).statut).toBe("MEMBRU");
    const fara = personSchema.parse(form());
    expect(applyExitRule(fara).statut).toBe("MEMBRU");
  });

  it("verificări de consistență a datelor, raportate împreună cu celelalte erori", () => {
    const r = personSchema.safeParse(form({ nume: "", dataNasterii: "2999-01-01" }));
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["nume", "dataNasterii"]));
    const q = personSchema.safeParse(form({ dataNasterii: "1990-01-01", dataIesire: "1980-01-01" }));
    expect(q.error!.issues.map((i) => i.path[0])).toEqual(["dataIesire"]);
    expect(personDateErrors(personSchema.parse(form({ dataNasterii: "2020-01-01" })), "2019-01-01")).toHaveProperty("dataNasterii");
  });

  it("a full baptism date also fills the year; the year alone leaves the date empty", () => {
    expect(personSchema.parse(form({ dataBotez: "2008-06-15", botezAn: "2001" }))).toMatchObject({ dataBotez: "2008-06-15", botezAn: 2008 });
    expect(personSchema.parse(form({ botezAn: "2010" }))).toMatchObject({ dataBotez: null, botezAn: 2010 });
    expect(personSchema.parse(form({ botezAn: "" }))).toMatchObject({ dataBotez: null, botezAn: null });
    for (const bad of ["1899", "3000", "20x0", "10"]) {
      const r = personSchema.safeParse(form({ botezAn: bad }));
      expect(r.success, bad).toBe(false);
      expect(r.error!.issues.map((i) => i.path[0])).toEqual(["botezAn"]);
    }
  });

  it("Statut art. 24 and 28: the exit's conditions and an unbaptised aparținător", () => {
    const paths = (o: Record<string, string>) => {
      const r = personSchema.safeParse(form(o));
      return r.success ? [] : r.error.issues.map((i) => i.path[0]);
    };
    expect(paths({ dataIesire: "2025-05-01", modIesire: "RETRAGERE" })).toEqual(["dataCerereRetragere"]);
    expect(paths({ dataIesire: "2025-05-01", modIesire: "RETRAGERE", dataCerereRetragere: "2025-04-20" })).toEqual([]);
    expect(paths({ dataIesire: "2025-05-01", modIesire: "EXCLUDERE" })).toEqual(["iesireMeetingId"]);
    expect(paths({ dataIesire: "2025-05-01", modIesire: "EXCLUDERE", iesireMeetingId: "m1" })).toEqual([]);
    expect(paths({ dataIesire: "2025-05-01", modIesire: "TRANSFER" })).toEqual(["bisericaDestinatie"]);
    expect(paths({ statut: "APARTINATOR", botezAn: "2010" })).toEqual(["statut"]);
    expect(paths({ statut: "APARTINATOR" })).toEqual([]);
    expect(paths({ plecatDin: "2999-01-01" })).toContain("plecatDin");
  });
});
