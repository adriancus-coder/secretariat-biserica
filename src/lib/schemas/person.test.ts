import { describe, expect, it } from "vitest";
import { applyExitRule, personDateErrors, personSchema } from "./person";

const form = (over: Record<string, string> = {}) => ({ nume: "Popescu", prenume: "Ion", statut: "MEMBRU", ...over });

describe("validarea persoanei", () => {
  it("acceptă un formular minimal și normalizează valorile goale", () => {
    const r = personSchema.parse(form({ gen: "", dataNasterii: "", email: "  " }));
    expect(r.gen).toBeNull();
    expect(r.dataNasterii).toBeNull();
    expect(r.email).toBe("");
    expect(r.familie).toBe("");
  });

  it("numele este obligatoriu; datele și e-mailul se validează", () => {
    const r = personSchema.safeParse(form({ nume: "  ", dataBotez: "2024-02-30", email: "nu-e-email", statut: "X" }));
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["nume", "dataBotez", "email", "statut"]));
  });

  it("regula din prototip: cu dată de ieșire, statutul devine „Fost membru” (mai puțin la deces)", () => {
    const base = personSchema.parse(form({ dataIesire: "2025-05-01", modIesire: "TRANSFER" }));
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
});
