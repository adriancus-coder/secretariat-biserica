import { compareRo } from "./text";

/**
 * Sorting for every data table (DataTable on screen, the PDF / Excel exports). Numbers numerically,
 * dates (ISO "YYYY-MM-DD") chronologically, text with the Romanian collation; empty values last in
 * both directions. The sort lives in the URL as `?sort=<table>.<column>&dir=asc|desc`. Pure.
 */
export type ColType = "number" | "text" | "date";
export type SortDir = "asc" | "desc";
export type SortValue = string | number | null;
export interface SortState {
  col: string;
  dir: SortDir;
}
export interface SortColumn {
  key: string;
  label: string;
  type: ColType;
}

export function compareValues(a: SortValue, b: SortValue, type: ColType): number {
  if (type === "number") return Number(a) - Number(b);
  if (type === "date") return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  return compareRo(String(a), String(b));
}

/** Stable sort by one column; rows without a value stay at the end whatever the direction. */
export function sortRows<R>(rows: readonly R[], value: (r: R) => SortValue, type: ColType, dir: SortDir): R[] {
  const empty = (v: SortValue) => v === null || v === "" || (typeof v === "number" && Number.isNaN(v));
  return rows
    .map((r, i) => ({ r, i, v: value(r) }))
    .sort((x, y) => {
      if (empty(x.v) || empty(y.v)) return empty(x.v) === empty(y.v) ? x.i - y.i : empty(x.v) ? 1 : -1;
      return (dir === "asc" ? 1 : -1) * compareValues(x.v, y.v, type) || x.i - y.i;
    })
    .map((x) => x.r);
}

/** A tap on a header: ascending, then descending, then back to the table's default order (null). */
export function nextSort(current: SortState | null, col: string): SortState | null {
  if (!current || current.col !== col) return { col, dir: "asc" };
  return current.dir === "asc" ? { col, dir: "desc" } : null;
}

/** The sort chosen for `tableId` in the URL, or null (another table's, unknown column or none). */
export function parseSort(sort: string | null | undefined, dir: string | null | undefined, tableId: string, columns: readonly { key: string }[]): SortState | null {
  if (!sort || !sort.startsWith(`${tableId}.`)) return null;
  const col = sort.slice(tableId.length + 1);
  if (!columns.some((c) => c.key === col)) return null;
  return { col, dir: dir === "desc" ? "desc" : "asc" };
}

export const sortParamValue = (tableId: string, s: SortState) => `${tableId}.${s.col}`;

/** Rows in the order a table shows them: the chosen sort, else its default (e.g. newest year first). */
export function orderRows<R extends { sort: readonly SortValue[] }>(rows: readonly R[], columns: readonly SortColumn[], sort: SortState | null, fallback?: SortState): R[] {
  const s = sort ?? fallback;
  if (!s) return [...rows];
  const i = columns.findIndex((c) => c.key === s.col);
  if (i < 0) return [...rows];
  return sortRows(rows, (r) => r.sort[i] ?? null, columns[i].type, s.dir);
}
