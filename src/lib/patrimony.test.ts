import { describe, expect, it } from "vitest";
import { printToText } from "@/domain/print";
import { categoryTotals, filterAssets, inventoryPrint, inventoryReminder, nok, patrimonyLine, type AssetRow } from "./patrimony";

const a = (id: string, over: Partial<AssetRow> = {}): AssetRow => ({
  id,
  nrInventar: Number(id),
  denumire: `Bun ${id}`,
  categorie: "Mobilier",
  cantitate: 1,
  valoare: 1000,
  dataIntrarii: "2025-01-01",
  provenienta: "CUMPARARE",
  loc: "Sala mare",
  stare: "BUN",
  dataIesirii: null,
  motivIesirii: "",
  responsabil: "",
  ...over,
});
const church = { nume: "Biserica Test", adresa: "", codPostal: "", localitate: "", orgNr: "", telefon: "", email: "", pastor: "Pop Ion", secretar: "Rusu Ana" } as never;

describe("patrimony (Statut art. 43 alin. 7, art. 54–55)", () => {
  const rows = [a("1", { cantitate: 40 }), a("2", { categorie: "Sonorizare și video", valoare: null }), a("3", { stare: "NECESITA_REPARATII", denumire: "Pian" }), a("4", { stare: "SCOS_DIN_UZ", dataIesirii: "2026-02-01", motivIesirii: "Defect" })];

  it("by default only the goods in use; filters by state, category and search", () => {
    expect(filterAssets(rows, "in-uz", "", "").map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(filterAssets(rows, "scoase", "", "").map((x) => x.id)).toEqual(["4"]);
    expect(filterAssets(rows, "toate", "Mobilier", "pian").map((x) => x.id)).toEqual(["3"]);
  });

  it("totals per category: lines, pieces, value; lines without a value counted apart", () => {
    expect(categoryTotals(filterAssets(rows, "in-uz", "", ""))).toEqual([
      { categorie: "Mobilier", pozitii: 2, bucati: 41, valoare: 2000, faraValoare: 0 },
      { categorie: "Sonorizare și video", pozitii: 1, bucati: 1, valoare: 0, faraValoare: 1 },
    ]);
    expect(nok(12500)).toBe("12 500 kr");
  });

  it("the inventory PDF has the goods, the totals and the pastor's and secretary's signatures", () => {
    const text = printToText(inventoryPrint(filterAssets(rows, "in-uz", "", ""), "2026-11-02", church));
    expect(text).toContain("Inventarul bunurilor la 2 nov 2026");
    expect(text).toContain("Pian");
    expect(text).not.toContain("Defect");
    expect(text).toMatch(/Pastor[\s\S]*Pop Ion/);
    expect(text).toMatch(/Secretar[\s\S]*Rusu Ana/);
  });

  it("the November reminder and the report's line without values", () => {
    expect(inventoryReminder("2026-11-15")).toBe("Inventarul bunurilor — verificați patrimoniul");
    expect(inventoryReminder("2026-10-31")).toBeNull();
    expect(patrimonyLine(0)).toBeNull();
    expect(patrimonyLine(1)).toBe("Patrimoniu: 1 bun în evidență.");
    expect(patrimonyLine(12)).toBe("Patrimoniu: 12 bunuri în evidență.");
  });
});
