import { readFileSync } from "node:fs";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { parseMinutesText } from "./minutes-parse";

const raw = async (file: string) => (await mammoth.extractRawText({ buffer: readFileSync(`docs/samples/${file}`) })).value;
const FIVE = ["Dumitru Ciobanu", "Ovidiu Haidemak", "Nelu Gaju", "Florin Vasile", "Adrian Cușniriuc"];

describe("parseMinutesText (the church's Word template)", () => {
  it("reads minutes nr. 16 with five points", async () => {
    const { draft, warnings } = parseMinutesText(await raw("proces-verbal-nr-16.docx"));
    expect(warnings).toEqual([]);
    expect(draft.nr).toBe(16);
    expect(draft.data).toBe("2026-09-11");
    expect(draft.tip).toBe("comitet");
    expect(draft.prezenti).toEqual(FIVE);
    expect(draft.puncte).toHaveLength(5);
    expect(draft.puncte[0]).toBe("Sold curent 15080 kr");
    expect(draft.puncte[4]).toBe("Sarbatoarea multumirii in data de 31.10.2026 – aprobarea cheltuielilor aferente");
    expect(draft.formulaIncheiere).toBe("Toate punctele au fost votate în unanimitate de membrii prezenți.");
    expect(draft.secretar).toBe("Adrian Cușniriuc");
    expect(draft.pastor).toBe("Dumitru Ciobanu");
  });

  it("reads the empty model: no number, no points", async () => {
    const { draft } = parseMinutesText(await raw("proces-verbal-gol.docx"));
    expect(draft.nr).toBeNull();
    expect(draft.data).toBe("2026-08-16");
    expect(draft.prezenti).toEqual(FIVE);
    expect(draft.puncte).toEqual([]);
  });

  it("accepts dashes in dates, numbered points and names on the attendee line", () => {
    const { draft, warnings } = parseMinutesText(
      [
        "PROCES-VERBAL NR. 3",
        "Încheiat azi, 05-02-2025, cu ocazia ședinței de Adunare generală.",
        "Prezenți: Ana Pop, Ion Rusu",
        "S-au discutat și aprobat următoarele:",
        "1. Bugetul",
        "2) Curățenia",
        "Toate punctele au fost votate în unanimitate.",
      ].join("\n"),
    );
    expect(warnings).toEqual([]);
    expect(draft).toMatchObject({ nr: 3, data: "2025-02-05", tip: "Adunare generală", prezenti: ["Ana Pop", "Ion Rusu"], puncte: ["Bugetul", "Curățenia"] });
  });

  it("warns about a missing or impossible date and a missing attendee list", () => {
    const { draft, warnings } = parseMinutesText("Proces verbal\nÎncheiat azi, 31.02.2026.");
    expect(draft.data).toBeNull();
    expect(warnings).toHaveLength(2);
  });
});
