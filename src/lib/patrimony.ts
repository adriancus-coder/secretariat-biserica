import { pastorSecretarySignatures, type PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";
import { fmt } from "./format";
import type { SortParams } from "./statistics-report";
import { orderRows, parseSort, type SortColumn, type SortState } from "./table-sort";
import { compareRo, normalizeSearch } from "./text";

/*
 * PATRIMONY (Statut art. 43 alin. 7: the secretary „ține la zi evidența patrimoniului acesteia”; art. 54
 * alin. 2: the patrimony is managed by the pastor and the committee or their delegates): the inventory
 * of the church's goods. Pure.
 */

export const ASSET_ORIGIN_LABEL = { CUMPARARE: "Cumpărare", DONATIE: "Donație", ALTELE: "Altele" } as const;
export const ASSET_STATE_LABEL = { BUN: "Bun", NECESITA_REPARATII: "Necesită reparații", SCOS_DIN_UZ: "Scos din uz" } as const;
export type AssetOriginKey = keyof typeof ASSET_ORIGIN_LABEL;
export type AssetStateKey = keyof typeof ASSET_STATE_LABEL;

/** „În uz” (the default) = Bun + Necesită reparații. */
export const ASSET_FILTERS = ["in-uz", "bun", "reparatii", "scoase", "toate"] as const;
export type AssetFilter = (typeof ASSET_FILTERS)[number];
export const ASSET_FILTER_LABEL: Record<AssetFilter, string> = { "in-uz": "În uz", bun: "Bune", reparatii: "Necesită reparații", scoase: "Scoase din uz", toate: "Toate" };

export interface AssetRow {
  id: string;
  nrInventar: number;
  denumire: string;
  categorie: string;
  cantitate: number;
  valoare: number | null;
  dataIntrarii: string | null;
  provenienta: AssetOriginKey;
  loc: string;
  stare: AssetStateKey;
  dataIesirii: string | null;
  motivIesirii: string;
  responsabil: string;
}

export function filterAssets(rows: AssetRow[], filter: AssetFilter, categorie: string, q: string): AssetRow[] {
  const terms = normalizeSearch(q).split(/\s+/).filter(Boolean);
  return rows.filter((a) => {
    if (filter === "in-uz" && a.stare === "SCOS_DIN_UZ") return false;
    if (filter === "bun" && a.stare !== "BUN") return false;
    if (filter === "reparatii" && a.stare !== "NECESITA_REPARATII") return false;
    if (filter === "scoase" && a.stare !== "SCOS_DIN_UZ") return false;
    if (categorie && a.categorie !== categorie) return false;
    const hay = normalizeSearch([a.nrInventar, a.denumire, a.categorie, a.loc, a.responsabil].join(" "));
    return terms.every((t) => hay.includes(t));
  });
}

/** "12 500 kr" (whole kroner, Norwegian grouping); "—" when unknown. */
export const nok = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("nb-NO").replace(/ /g, " ")} kr`);

export const ASSET_TABLE_ID = "patrimoniu";
export const ASSET_COLUMNS: SortColumn[] = [
  { key: "nr", label: "Nr. inv.", type: "number" },
  { key: "denumire", label: "Denumire", type: "text" },
  { key: "categorie", label: "Categorie", type: "text" },
  { key: "cantitate", label: "Cantitate", type: "number" },
  { key: "valoare", label: "Valoare (NOK)", type: "number" },
  { key: "loc", label: "Loc", type: "text" },
  { key: "stare", label: "Stare", type: "text" },
  { key: "intrare", label: "Data intrării", type: "date" },
];
export const ASSET_DEFAULT_SORT: SortState = { col: "nr", dir: "asc" };
export const assetSort = (a: AssetRow) => [a.nrInventar, a.denumire, a.categorie, a.cantitate, a.valoare, a.loc, ASSET_STATE_LABEL[a.stare], a.dataIntrarii];
export const assetCells = (a: AssetRow) => [String(a.nrInventar), a.denumire, a.categorie, String(a.cantitate), a.valoare === null ? "—" : String(a.valoare), a.loc, ASSET_STATE_LABEL[a.stare], a.dataIntrarii ? fmt(a.dataIntrarii) : ""];

export function sortedAssets(rows: AssetRow[], params: SortParams = {}) {
  return orderRows(
    rows.map((a) => ({ ...a, sort: assetSort(a) })),
    ASSET_COLUMNS,
    parseSort(params.sort, params.dir, ASSET_TABLE_ID, ASSET_COLUMNS),
    ASSET_DEFAULT_SORT,
  );
}

/** Totals per category: lines, pieces, value (lines without a value counted apart). */
export interface CategoryTotal {
  categorie: string;
  pozitii: number;
  bucati: number;
  valoare: number;
  faraValoare: number;
}
export function categoryTotals(rows: AssetRow[]): CategoryTotal[] {
  const m = new Map<string, CategoryTotal>();
  for (const a of rows) {
    const t = m.get(a.categorie) ?? { categorie: a.categorie, pozitii: 0, bucati: 0, valoare: 0, faraValoare: 0 };
    t.pozitii++;
    t.bucati += a.cantitate;
    if (a.valoare === null) t.faraValoare++;
    else t.valoare += a.valoare;
    m.set(a.categorie, t);
  }
  return [...m.values()].sort((x, y) => compareRo(x.categorie, y.categorie));
}

export const inventoryTitle = (date: string) => `Inventarul bunurilor la ${fmt(date)}`;

/** „Inventarul bunurilor la <data>”: the goods in use, totals per category, the pastor's and the secretary's signatures. */
export function inventoryPrint(rows: AssetRow[], date: string, church: ChurchInfo, params: SortParams = {}): PrintSpec {
  const totals = categoryTotals(rows);
  return {
    title: inventoryTitle(date),
    church,
    landscape: true,
    blocks: [
      { type: "title", text: inventoryTitle(date) },
      { type: "table", columns: ASSET_COLUMNS.map((c) => c.label), rows: sortedAssets(rows, params).map(assetCells) },
      { type: "para", runs: [{ text: "Totaluri pe categorii", bold: true }] },
      {
        type: "table",
        columns: ["Categorie", "Poziții", "Bucăți", "Valoare (NOK)"],
        rows: [
          ...totals.map((t) => [t.categorie, String(t.pozitii), String(t.bucati), String(t.valoare)]),
          ["Total", String(rows.length), String(rows.reduce((s, a) => s + a.cantitate, 0)), String(rows.reduce((s, a) => s + (a.valoare ?? 0), 0))],
        ],
      },
      { type: "para", runs: [{ text: `Statut art. 43 alin. 7 și art. 54 alin. 2. Întocmit la ${fmt(date)}.` }] },
      pastorSecretarySignatures(church),
    ],
  };
}

/** Acasă (write roles): in November, before the General Assembly, the yearly check of the inventory. */
export function inventoryReminder(today: string): string | null {
  return today.slice(5, 7) === "11" ? "Inventarul bunurilor — verificați patrimoniul" : null;
}

/** The report's optional line (no values): only when goods are in the inventory. */
export function patrimonyLine(count: number): string | null {
  return count > 0 ? `Patrimoniu: ${count} ${count === 1 ? "bun" : "bunuri"} în evidență.` : null;
}
