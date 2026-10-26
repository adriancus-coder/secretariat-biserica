import type { PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";
import type { Neam } from "./kinship";
import type { SortParams } from "./statistics-report";
import { orderRows, parseSort, type SortColumn, type SortState } from "./table-sort";

/**
 * Statistici → Neamuri: the neamuri with at least two families (the card's number), as one table for
 * the page, the PDF and the Excel export (same rows, same sort). Names of the neamuri and counts only.
 * Pure.
 */
export const NEAM_TABLE_ID = "neamuri";
export const NEAM_COLUMNS: SortColumn[] = [
  { key: "neam", label: "Neam", type: "text" },
  { key: "persoane", label: "Persoane", type: "number" },
  { key: "membri", label: "Membri", type: "number" },
  { key: "familii", label: "Familii", type: "number" },
  { key: "generatii", label: "Generații", type: "number" },
];
export const NEAM_DEFAULT_SORT: SortState = { col: "persoane", dir: "desc" };

/** The neamuri counted on the card: at least two families. */
export const listedNeamuri = (list: Neam[]) => list.filter((n) => n.families >= 2);

export function neamRows(list: Neam[], params: SortParams = {}) {
  const rows = listedNeamuri(list).map((n) => ({ key: n.id, neam: n, sort: [n.name, n.persons, n.membri, n.families, n.generations] }));
  return orderRows(rows, NEAM_COLUMNS, parseSort(params.sort, params.dir, NEAM_TABLE_ID, NEAM_COLUMNS), NEAM_DEFAULT_SORT);
}

/** The list as a PDF (a table, the screen's sort). */
export function neamPrint(list: Neam[], church: ChurchInfo, params: SortParams = {}): PrintSpec {
  return {
    title: "Neamuri",
    church,
    blocks: [
      { type: "title", text: "Neamuri" },
      { type: "para", runs: [{ text: "Grupuri de rude din registru (legături părinte–copil și căsătorie) cu cel puțin două familii." }] },
      { type: "table", columns: NEAM_COLUMNS.map((c) => c.label), rows: neamRows(list, params).map((r) => r.sort.map(String)) },
    ],
  };
}
