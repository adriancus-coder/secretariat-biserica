"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { nextSort, orderRows, parseSort, sortParamValue, type SortColumn, type SortState, type SortValue } from "@/lib/table-sort";

export interface DataRow {
  key: string;
  /** What each cell shows (links included). */
  cells: ReactNode[];
  /** What each cell sorts by (a number, an ISO date or text). */
  sort: SortValue[];
  /** Optional class per cell (e.g. "neg" for a negative number). */
  classes?: (string | undefined)[];
}

const SWIPED_KEY = "tabel-glisat";

function SortIcon({ state }: { state: "asc" | "desc" | "none" }) {
  return (
    <svg className="sort-icon" viewBox="0 0 12 16" width="10" height="14" aria-hidden="true">
      {state !== "desc" ? <path d="M6 1 11 7H1z" fill="currentColor" opacity={state === "asc" ? 1 : 0.4} /> : null}
      {state !== "asc" ? <path d="M6 15 1 9h10z" fill="currentColor" opacity={state === "desc" ? 1 : 0.4} /> : null}
    </svg>
  );
}

/**
 * Every data table (CLAUDE.md UI rules): header buttons sort by any column (▲ ascending, ▼ descending,
 * ↕ not sorted; a tap cycles ascending → descending → the default order); numbers numerically, dates
 * chronologically, text in Romanian order. The sort is kept in the URL (`?sort=<id>.<column>&dir=`) so
 * reloads, shared links and the PDF / Excel exports (SortAwareDownload) follow it. Footer rows (totals)
 * stay at the bottom. On narrow screens the table scrolls inside its card with the first column and
 * the header kept in view.
 */
export function DataTable({
  id,
  caption,
  columns,
  rows,
  footer,
  defaultSort,
  rowHeader = true,
}: {
  id: string;
  caption: string;
  columns: SortColumn[];
  rows: DataRow[];
  footer?: DataRow[];
  defaultSort?: SortState;
  /** The first cell of a row names it (rendered as a row header). */
  rowHeader?: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const chosen = parseSort(params.get("sort"), params.get("dir"), id, columns);
  const current = chosen ?? defaultSort ?? null;
  const shown = orderRows(rows, columns, chosen, defaultSort);
  const wrap = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Shown until the first horizontal swipe on this device (the server renders no hint either way:
  // `overflow` is only known in the browser).
  const [swiped, setSwiped] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(SWIPED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // The observer also reports once right away.
    const ro = new ResizeObserver(() => setOverflow(el.scrollWidth > el.clientWidth + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const left = (wrap.current?.scrollLeft ?? 0) > 0;
    setScrolled(left);
    if (left && !swiped) {
      setSwiped(true);
      try {
        localStorage.setItem(SWIPED_KEY, "1");
      } catch {
        /* the hint simply shows again next time */
      }
    }
  };

  const sortBy = (col: string) => {
    const next = nextSort(chosen, col);
    const q = new URLSearchParams(params.toString());
    if (next) {
      q.set("sort", sortParamValue(id, next));
      q.set("dir", next.dir);
    } else {
      q.delete("sort");
      q.delete("dir");
    }
    const qs = q.toString();
    // Shallow: the rows are already here. Next.js syncs useSearchParams with replaceState only when the
    // state is not its own, so pass null.
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
  };

  const row = (r: DataRow, inFooter = false) => (
    <tr key={r.key} className={inFooter ? "data-table-total" : undefined}>
      {r.cells.map((cell, i) =>
        i === 0 && rowHeader ? (
          <th key={i} scope="row" className={r.classes?.[i]}>
            {cell}
          </th>
        ) : (
          <td key={i} className={r.classes?.[i]}>
            {cell}
          </td>
        ),
      )}
    </tr>
  );

  return (
    <div className="data-table-block">
      {overflow && !swiped ? (
        <p className="hint data-table-hint" aria-hidden="true">
          Glisați pentru mai multe coloane →
        </p>
      ) : null}
      <div ref={wrap} className={`data-table-wrap${scrolled ? " scrolled" : ""}`} onScroll={onScroll} tabIndex={overflow ? 0 : undefined} role="region" aria-label={caption}>
        <table className="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const state = current?.col === c.key ? current.dir : "none";
                return (
                  <th key={c.key} scope="col" aria-sort={state === "asc" ? "ascending" : state === "desc" ? "descending" : "none"} className={c.type === "text" ? "text" : undefined}>
                    <button type="button" className="sort-btn" onClick={() => sortBy(c.key)} title={`Sortează după „${c.label}”`}>
                      <span>{c.label}</span>
                      <SortIcon state={state} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{shown.map((r) => row(r))}</tbody>
          {footer?.length ? <tfoot>{footer.map((r) => row(r, true))}</tfoot> : null}
        </table>
      </div>
    </div>
  );
}

