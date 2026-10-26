import { describe, expect, it } from "vitest";
import { nextSort, orderRows, parseSort, sortRows } from "./table-sort";

describe("table sorting", () => {
  it("numbers numerically, dates chronologically, text in Romanian order, empty last", () => {
    expect(sortRows([10, 9, 100, null], (v) => v, "number", "asc")).toEqual([9, 10, 100, null]);
    expect(sortRows([10, 9, 100, null], (v) => v, "number", "desc")).toEqual([100, 10, 9, null]);
    expect(sortRows(["2026-01-02", "2025-12-31", "2026-01-10"], (v) => v, "date", "asc")).toEqual(["2025-12-31", "2026-01-02", "2026-01-10"]);
    expect(sortRows(["Țicu", "Sava", "Șerban", "Tudor", "Ana"], (v) => v, "text", "asc")).toEqual(["Ana", "Sava", "Șerban", "Tudor", "Țicu"]);
  });

  it("is stable for equal values", () => {
    const rows = [{ n: "a", v: 1 }, { n: "b", v: 1 }, { n: "c", v: 0 }];
    expect(sortRows(rows, (r) => r.v, "number", "desc").map((r) => r.n)).toEqual(["a", "b", "c"]);
  });

  it("a header tap cycles ascending → descending → default", () => {
    expect(nextSort(null, "membri")).toEqual({ col: "membri", dir: "asc" });
    expect(nextSort({ col: "membri", dir: "asc" }, "membri")).toEqual({ col: "membri", dir: "desc" });
    expect(nextSort({ col: "membri", dir: "desc" }, "membri")).toBeNull();
    expect(nextSort({ col: "an", dir: "desc" }, "membri")).toEqual({ col: "membri", dir: "asc" });
  });

  it("reads only this table's sort from the URL", () => {
    const cols = [{ key: "an" }, { key: "membri" }];
    expect(parseSort("evolutie.membri", "desc", "evolutie", cols)).toEqual({ col: "membri", dir: "desc" });
    expect(parseSort("evolutie.membri", "x", "evolutie", cols)).toEqual({ col: "membri", dir: "asc" });
    expect(parseSort("statut.total", "desc", "evolutie", cols)).toBeNull();
    expect(parseSort("evolutie.nimic", "desc", "evolutie", cols)).toBeNull();
    expect(parseSort(null, null, "evolutie", cols)).toBeNull();
  });

  it("orders rows by the chosen sort, else the default", () => {
    const cols = [{ key: "an", label: "An", type: "number" as const }, { key: "membri", label: "Membri", type: "number" as const }];
    const rows = [2024, 2025, 2026].map((y, i) => ({ y, sort: [y, [40, 38, 41][i]] }));
    expect(orderRows(rows, cols, null, { col: "an", dir: "desc" }).map((r) => r.y)).toEqual([2026, 2025, 2024]);
    expect(orderRows(rows, cols, { col: "membri", dir: "asc" }, { col: "an", dir: "desc" }).map((r) => r.y)).toEqual([2025, 2024, 2026]);
  });
});
