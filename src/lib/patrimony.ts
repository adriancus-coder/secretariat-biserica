import { pastorSecretarySignatures, type Block, type PrintSpec } from "@/domain/print";
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
  /** PATRIMONY-SUBCATEGORIES: the subcategory's name ("" = none), its id and its place in the category. */
  subcategorie: string;
  subcategoryId: string | null;
  subcategoryOrder: number | null;
  cantitate: number;
  valoare: number | null;
  dataIntrarii: string | null;
  provenienta: AssetOriginKey;
  loc: string;
  stare: AssetStateKey;
  dataIesirii: string | null;
  motivIesirii: string;
  responsabil: string;
  /** PATRIMONY-PHOTOS: the main photo, when the good has one. */
  photoId?: string | null;
}

/** The subcategory filter's value for the goods without a subcategory. */
export const NO_SUBCATEGORY = "fara";
export const NO_SUBCATEGORY_LABEL = "Fără subcategorie";

/** `sub` = a subcategory's id, NO_SUBCATEGORY, or "" (all). */
export function filterAssets(rows: AssetRow[], filter: AssetFilter, categorie: string, q: string, sub = ""): AssetRow[] {
  const terms = normalizeSearch(q).split(/\s+/).filter(Boolean);
  return rows.filter((a) => {
    if (filter === "in-uz" && a.stare === "SCOS_DIN_UZ") return false;
    if (filter === "bun" && a.stare !== "BUN") return false;
    if (filter === "reparatii" && a.stare !== "NECESITA_REPARATII") return false;
    if (filter === "scoase" && a.stare !== "SCOS_DIN_UZ") return false;
    if (categorie && a.categorie !== categorie) return false;
    if (sub === NO_SUBCATEGORY ? a.subcategoryId !== null : sub && a.subcategoryId !== sub) return false;
    const hay = normalizeSearch([a.nrInventar, a.denumire, a.categorie, a.subcategorie, a.loc, a.responsabil].join(" "));
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
  { key: "subcategorie", label: "Subcategorie", type: "text" },
  { key: "cantitate", label: "Cantitate", type: "number" },
  { key: "valoare", label: "Valoare (NOK)", type: "number" },
  { key: "loc", label: "Loc", type: "text" },
  { key: "stare", label: "Stare", type: "text" },
  { key: "intrare", label: "Data intrării", type: "date" },
];
export const ASSET_DEFAULT_SORT: SortState = { col: "nr", dir: "asc" };
export const assetSort = (a: AssetRow) => [a.nrInventar, a.denumire, a.categorie, a.subcategorie, a.cantitate, a.valoare, a.loc, ASSET_STATE_LABEL[a.stare], a.dataIntrarii];
export const assetCells = (a: AssetRow) => [String(a.nrInventar), a.denumire, a.categorie, a.subcategorie, String(a.cantitate), a.valoare === null ? "—" : String(a.valoare), a.loc, ASSET_STATE_LABEL[a.stare], a.dataIntrarii ? fmt(a.dataIntrarii) : ""];

export function sortedAssets(rows: AssetRow[], params: SortParams = {}) {
  return orderRows(
    rows.map((a) => ({ ...a, sort: assetSort(a) })),
    ASSET_COLUMNS,
    parseSort(params.sort, params.dir, ASSET_TABLE_ID, ASSET_COLUMNS),
    ASSET_DEFAULT_SORT,
  );
}

/** Totals per category (and per subcategory): lines, pieces, value (lines without a value counted apart). */
export interface AssetTotal {
  pozitii: number;
  bucati: number;
  valoare: number;
  faraValoare: number;
}
export interface SubcategoryTotal extends AssetTotal {
  /** "" = the goods without a subcategory. */
  subcategorie: string;
  subcategoryId: string | null;
}
export interface CategoryTotal extends AssetTotal {
  categorie: string;
  /** The subtotals, in the subcategories' order (the goods without one last); empty when no good of the category has one. */
  sub: SubcategoryTotal[];
}

const emptyTotal = (): AssetTotal => ({ pozitii: 0, bucati: 0, valoare: 0, faraValoare: 0 });
function add(t: AssetTotal, a: AssetRow) {
  t.pozitii++;
  t.bucati += a.cantitate;
  if (a.valoare === null) t.faraValoare++;
  else t.valoare += a.valoare;
}

/** The goods grouped category → subcategory (categories alphabetically, subcategories in their order, none last). */
export function groupAssets<T extends AssetRow>(rows: T[]): { categorie: string; subs: { subcategorie: string; subcategoryId: string | null; order: number | null; rows: T[] }[] }[] {
  const cats = new Map<string, Map<string, { subcategorie: string; subcategoryId: string | null; order: number | null; rows: T[] }>>();
  for (const a of rows) {
    const subs = cats.get(a.categorie) ?? new Map();
    const key = a.subcategoryId ?? "";
    const g = subs.get(key) ?? { subcategorie: a.subcategorie, subcategoryId: a.subcategoryId, order: a.subcategoryOrder, rows: [] };
    g.rows.push(a);
    subs.set(key, g);
    cats.set(a.categorie, subs);
  }
  const subOrder = (x: { subcategoryId: string | null; order: number | null; subcategorie: string }, y: typeof x) =>
    Number(x.subcategoryId === null) - Number(y.subcategoryId === null) || (x.order ?? 0) - (y.order ?? 0) || compareRo(x.subcategorie, y.subcategorie);
  return [...cats.entries()].sort(([x], [y]) => compareRo(x, y)).map(([categorie, subs]) => ({ categorie, subs: [...subs.values()].sort(subOrder) }));
}

export function categoryTotals(rows: AssetRow[]): CategoryTotal[] {
  return groupAssets(rows).map(({ categorie, subs }) => {
    const t: CategoryTotal = { categorie, ...emptyTotal(), sub: [] };
    for (const g of subs) {
      const st: SubcategoryTotal = { subcategorie: g.subcategorie, subcategoryId: g.subcategoryId, ...emptyTotal() };
      for (const a of g.rows) {
        add(t, a);
        add(st, a);
      }
      t.sub.push(st);
    }
    if (!subs.some((g) => g.subcategoryId !== null)) t.sub = [];
    return t;
  });
}

export const subcategoryLabel = (name: string) => name || NO_SUBCATEGORY_LABEL;

export const inventoryTitle = (date: string) => `Inventarul bunurilor la ${fmt(date)}`;

/** The grouped PDF's columns: the category and the subcategory are the groups' headings. */
const PRINT_COLUMNS = ASSET_COLUMNS.filter((c) => c.key !== "categorie" && c.key !== "subcategorie");
const printCells = (a: AssetRow) => {
  const cells = assetCells(a);
  return [cells[0], cells[1], ...cells.slice(4)];
};
/** A heading / subtotal row of the grouped table: the label under „Denumire”, pieces and value in their columns. */
function groupRow(label: string, t?: AssetTotal): string[] {
  const row = PRINT_COLUMNS.map(() => "");
  row[1] = label;
  if (t) {
    row[PRINT_COLUMNS.findIndex((c) => c.key === "cantitate")] = String(t.bucati);
    row[PRINT_COLUMNS.findIndex((c) => c.key === "valoare")] = String(t.valoare);
  }
  return row;
}

/**
 * „Inventarul bunurilor la <data>”: the goods in use grouped category → subcategory with subtotals (the
 * page's sort inside each group), totals per category and subcategory, the pastor's and the secretary's
 * signatures.
 */
export function inventoryPrint(rows: AssetRow[], date: string, church: ChurchInfo, params: SortParams = {}, photos?: ReadonlyMap<string, Uint8Array>): PrintSpec {
  const totals = categoryTotals(rows);
  const groups = groupAssets(sortedAssets(rows, params));
  const body: string[][] = [];
  const bold: boolean[] = [];
  const images: (Uint8Array | null | undefined)[] = [];
  const push = (cells: string[], isBold: boolean, image?: Uint8Array | null) => {
    body.push(photos ? ["", ...cells] : cells);
    bold.push(isBold);
    images.push(image);
  };
  for (const [i, g] of groups.entries()) {
    const total = totals[i];
    push(groupRow(g.categorie), true);
    const withSubs = g.subs.some((x) => x.subcategoryId !== null);
    for (const sg of g.subs) {
      if (withSubs) push(groupRow(subcategoryLabel(sg.subcategorie)), true);
      for (const a of sg.rows) push(printCells(a), false, photos ? (a.photoId ? (photos.get(a.photoId) ?? null) : null) : undefined);
      if (withSubs) {
        const st = total.sub.find((x) => x.subcategoryId === sg.subcategoryId)!;
        push(groupRow(`Subtotal ${subcategoryLabel(sg.subcategorie)}`, st), true);
      }
    }
    push(groupRow(`Total ${g.categorie}`, total), true);
  }
  const goods: Block = {
    type: "table",
    columns: [...(photos ? ["Poză"] : []), ...PRINT_COLUMNS.map((c) => c.label)],
    rows: body,
    bold,
    ...(photos ? { images: images.map((x) => x ?? null), imageRows: images.map((x) => x !== undefined) } : {}),
  };
  return {
    title: inventoryTitle(date),
    church,
    landscape: true,
    blocks: [
      { type: "title", text: inventoryTitle(date) },
      goods,
      { type: "para", runs: [{ text: "Totaluri pe categorii și subcategorii", bold: true }] },
      {
        type: "table",
        columns: ["Categorie / subcategorie", "Poziții", "Bucăți", "Valoare (NOK)"],
        rows: [
          ...totals.flatMap((t) => [
            [t.categorie, String(t.pozitii), String(t.bucati), String(t.valoare)],
            ...t.sub.map((x) => [`— ${subcategoryLabel(x.subcategorie)}`, String(x.pozitii), String(x.bucati), String(x.valoare)]),
          ]),
          ["Total", String(rows.length), String(rows.reduce((s, a) => s + a.cantitate, 0)), String(rows.reduce((s, a) => s + (a.valoare ?? 0), 0))],
        ],
        bold: [...totals.flatMap((t) => [true, ...t.sub.map(() => false)]), true],
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
