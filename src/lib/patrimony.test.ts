import { describe, expect, it } from "vitest";
import { printToText } from "@/domain/print";
import { photoQuotaText } from "./asset-photos";
import { categoryTotals, filterAssets, inventoryPrint, inventoryReminder, nok, patrimonyLine, type AssetRow } from "./patrimony";

const a = (id: string, over: Partial<AssetRow> = {}): AssetRow => ({
  id,
  nrInventar: Number(id),
  denumire: `Bun ${id}`,
  categorie: "Mobilier",
  subcategorie: "",
  subcategoryId: null,
  subcategoryOrder: null,
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
      { categorie: "Mobilier", pozitii: 2, bucati: 41, valoare: 2000, faraValoare: 0, sub: [] },
      { categorie: "Sonorizare și video", pozitii: 1, bucati: 1, valoare: 0, faraValoare: 1, sub: [] },
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

  it("„Cu poze”: a first column with the main photo of each good (by default without photos)", () => {
    const img = new Uint8Array([0xff, 0xd8, 0xff]);
    const spec = inventoryPrint([a("1", { photoId: "p1" }), a("2")], "2026-11-02", church, {}, new Map([["p1", img]]));
    const table = spec.blocks.find((b) => b.type === "table")!;
    // The heading and total rows have no photo place; the goods rows have theirs.
    expect(table.type === "table" && [table.columns[0], table.images!.filter((_, i) => table.imageRows![i])]).toEqual(["Poză", [img, null]]);
    const plain = inventoryPrint([a("1", { photoId: "p1" })], "2026-11-02", church).blocks.find((b) => b.type === "table")!;
    expect(plain.type === "table" && plain.images).toBeUndefined();
    expect(photoQuotaText(34 * 1024 * 1024)).toBe("Pozele patrimoniului: 34 MB din 100 MB");
  });

  it("PATRIMONY-SUBCATEGORIES: filter, subtotals in the subcategories' order and the grouped PDF", () => {
    const mic = { subcategoryId: "s-mic", subcategorie: "Microfoane", subcategoryOrder: 1 };
    const mix = { subcategoryId: "s-mix", subcategorie: "Mixere", subcategoryOrder: 0 };
    const goods = [
      a("1", { categorie: "Sonorizare și video", ...mic, denumire: "Shure SM58", cantitate: 4, valoare: 4000 }),
      a("2", { categorie: "Sonorizare și video", ...mix, denumire: "Yamaha MG10", valoare: 3000 }),
      a("3", { categorie: "Sonorizare și video", denumire: "Cablu XLR", cantitate: 10, valoare: 500 }),
      a("4", { denumire: "Masă" }),
    ];
    expect(filterAssets(goods, "toate", "", "", "s-mic").map((x) => x.id)).toEqual(["1"]);
    expect(filterAssets(goods, "toate", "Sonorizare și video", "", "fara").map((x) => x.id)).toEqual(["3"]);
    expect(filterAssets(goods, "toate", "", "microfoane", "").map((x) => x.id)).toEqual(["1"]);
    const sono = categoryTotals(goods).find((t) => t.categorie === "Sonorizare și video")!;
    expect(sono.sub.map((x) => [x.subcategorie, x.pozitii, x.bucati, x.valoare])).toEqual([
      ["Mixere", 1, 1, 3000],
      ["Microfoane", 1, 4, 4000],
      ["", 1, 10, 500],
    ]);
    expect(categoryTotals(goods).find((t) => t.categorie === "Mobilier")!.sub).toEqual([]);
    const text = printToText(inventoryPrint(goods, "2026-11-02", church));
    const lines = text.split("\n");
    const at = (s: string) => lines.findIndex((l) => l.includes(s));
    // Category → subcategory → goods → subtotal, the category's total after.
    expect(at("| Sonorizare și video |")).toBeLessThan(at("| Mixere |"));
    expect(at("| Mixere |")).toBeLessThan(at("Yamaha MG10"));
    expect(at("Yamaha MG10")).toBeLessThan(at("Subtotal Mixere"));
    expect(at("Subtotal Microfoane")).toBeLessThan(at("| Fără subcategorie |"));
    expect(lines[at("Subtotal Microfoane")]).toContain("| 4 | 4000 |");
    expect(lines[at("Total Sonorizare și video")]).toContain("| 15 | 7500 |");
    expect(text).toContain("— Microfoane | 1 | 4 | 4000");
    // Mobilier has no subcategory: no subcategory headings or subtotals.
    expect(text).not.toContain("Subtotal Fără subcategorie | 1 | 1000");
  });

  it("the November reminder and the report's line without values", () => {
    expect(inventoryReminder("2026-11-15")).toBe("Inventarul bunurilor — verificați patrimoniul");
    expect(inventoryReminder("2026-10-31")).toBeNull();
    expect(patrimonyLine(0)).toBeNull();
    expect(patrimonyLine(1)).toBe("Patrimoniu: 1 bun în evidență.");
    expect(patrimonyLine(12)).toBe("Patrimoniu: 12 bunuri în evidență.");
  });
});
