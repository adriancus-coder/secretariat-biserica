import type { PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";
import { fmt } from "./format";
import type { SortParams } from "./statistics-report";
import { orderRows, parseSort, type SortColumn, type SortState } from "./table-sort";
import { normalizeSearch } from "./text";

/*
 * CORRESPONDENCE-REGISTER (Statut art. 43 alin. 7: the secretary „ține evidența membrilor bisericii,
 * efectuează corespondența, …”): the registry of entries and exits. One number sequence per church and
 * year for the register's own rows; the documents issued in the app keep their own numbers (Document.nr,
 * never renumbered) and appear as exits with „Nr. document” — linked to a register row when one was
 * made for them (a reply), else on their own. Metadata only. Pure.
 */

export const DIRECTION_LABEL = { INTRARE: "Intrare", IESIRE: "Ieșire" } as const;
export type Direction = keyof typeof DIRECTION_LABEL;
export const DIRECTION_FILTERS = ["toate", "intrari", "iesiri"] as const;
export type DirectionFilter = (typeof DIRECTION_FILTERS)[number];
export const DIRECTION_FILTER_LABEL: Record<DirectionFilter, string> = { toate: "Toate", intrari: "Intrări", iesiri: "Ieșiri" };
/** The usual answers in „Rezolvare” (free text stays allowed). */
export const RESOLUTION_SUGGESTIONS = ["În lucru", "Clasat", "Răspuns cu nr. "];

/** One row of the register: a stored entry / exit, or a document of the app shown as an exit. */
export interface RegisterRow {
  key: string;
  /** The register row (null for a document shown on its own). */
  id: string | null;
  nr: number | null;
  data: string;
  directie: Direction;
  /** "De la" for an entry, "Către" for an exit. */
  party: string;
  subiect: string;
  rezolvare: string;
  /** "12/2026" of the document issued in the app. */
  docNr: string | null;
  documentId: string | null;
  /** "12/2026" of the entry this exit answers. */
  raspunsLa: string | null;
}

export const REGISTER_TABLE_ID = "corespondenta";
export const REGISTER_COLUMNS: SortColumn[] = [
  { key: "nr", label: "Nr.", type: "number" },
  { key: "data", label: "Data", type: "date" },
  { key: "directie", label: "Intrare / ieșire", type: "text" },
  { key: "parte", label: "De la / către", type: "text" },
  { key: "subiect", label: "Subiect", type: "text" },
  { key: "rezolvare", label: "Rezolvare", type: "text" },
  { key: "document", label: "Nr. document", type: "text" },
];
export const REGISTER_DEFAULT_SORT: SortState = { col: "data", dir: "desc" };

export interface StoredEntry {
  id: string;
  nr: number;
  an: number;
  data: string;
  directie: Direction;
  dela: string;
  catre: string;
  subiect: string;
  rezolvare: string;
  documentId: string | null;
  document: { nr: number; anRegistru: number } | null;
  raspunsLa: { nr: number; an: number } | null;
}
export interface IssuedDocument {
  id: string;
  nr: number;
  anRegistru: number;
  data: string;
  catre: string;
  persoana: string;
  subiect: string;
}

/** The register of a year: the stored rows and the documents not already linked to one. */
export function registerRows(entries: StoredEntry[], documents: IssuedDocument[]): RegisterRow[] {
  const linked = new Set(entries.map((e) => e.documentId).filter(Boolean));
  return [
    ...entries.map((e) => ({
      key: e.id,
      id: e.id,
      nr: e.nr,
      data: e.data,
      directie: e.directie,
      party: e.directie === "INTRARE" ? e.dela : e.catre,
      subiect: e.subiect,
      rezolvare: e.rezolvare,
      docNr: e.document ? `${e.document.nr}/${e.document.anRegistru}` : null,
      documentId: e.documentId,
      raspunsLa: e.raspunsLa ? `${e.raspunsLa.nr}/${e.raspunsLa.an}` : null,
    })),
    ...documents
      .filter((d) => !linked.has(d.id))
      .map((d) => ({
        key: `d:${d.id}`,
        id: null,
        nr: null,
        data: d.data,
        directie: "IESIRE" as const,
        party: d.catre || d.persoana,
        subiect: d.subiect,
        rezolvare: "",
        docNr: `${d.nr}/${d.anRegistru}`,
        documentId: d.id,
        raspunsLa: null,
      })),
  ];
}

/** Direction filter and search (number, sender / addressee, subject, resolution; diacritics ignored). */
export function filterRows(rows: RegisterRow[], filter: DirectionFilter, q: string): RegisterRow[] {
  const terms = normalizeSearch(q).split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (filter === "intrari" && r.directie !== "INTRARE") return false;
    if (filter === "iesiri" && r.directie !== "IESIRE") return false;
    const hay = normalizeSearch([r.nr ?? "", r.docNr ?? "", r.party, r.subiect, r.rezolvare].join(" "));
    return terms.every((t) => hay.includes(t));
  });
}

export const sortValues = (r: RegisterRow) => [r.nr, r.data, DIRECTION_LABEL[r.directie], r.party, r.subiect, r.rezolvare, r.docNr ?? ""];

export function sortedRows(rows: RegisterRow[], params: SortParams = {}) {
  const withSort = rows.map((r) => ({ ...r, sort: sortValues(r) }));
  return orderRows(withSort, REGISTER_COLUMNS, parseSort(params.sort, params.dir, REGISTER_TABLE_ID, REGISTER_COLUMNS), REGISTER_DEFAULT_SORT);
}

/** The cells of the PDF / Excel export, as shown. */
export const exportCells = (r: RegisterRow) => [r.nr ? String(r.nr) : "—", fmt(r.data), DIRECTION_LABEL[r.directie], r.party, r.subiect, r.rezolvare, r.docNr ?? ""];

export const registerTitle = (year: number) => `Registru de intrare-ieșire ${year}`;

/** „Registru de intrare-ieșire <an>” as a PDF table (the screen's filter and sort). */
export function registerPrint(rows: RegisterRow[], year: number, church: ChurchInfo, params: SortParams = {}): PrintSpec {
  return {
    title: registerTitle(year),
    church,
    landscape: true,
    blocks: [
      { type: "title", text: registerTitle(year) },
      { type: "table", columns: REGISTER_COLUMNS.map((c) => c.label), rows: sortedRows(rows, params).map(exportCells) },
    ],
  };
}
