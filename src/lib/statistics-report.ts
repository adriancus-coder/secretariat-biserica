import type { Block, PrintSpec } from "@/domain/print";
import type { MonthRow, Structure, YearRow } from "@/domain/evolution";
import type { ChurchInfo } from "@/domain/types";
import { fmt, MONTHS_L } from "./format";
import { orderRows, parseSort, type SortColumn, type SortState, type SortValue } from "./table-sort";

/** The Statistici tables (PDF and Excel share them) and the PDF spec. Aggregate numbers only, no names. Pure. */

export interface StatisticsReport {
  today: string;
  year: number;
  an: number | undefined;
  rows: YearRow[];
  months: MonthRow[];
  structure: Structure;
}

export interface StatTable {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

/**
 * A sortable table: column keys and types, each row's display values and sort values, the default
 * order. The page (DataTable) and the exports share these, so the PDF and Excel follow the screen.
 */
export interface StatTableDef {
  id: string;
  name: string;
  columns: SortColumn[];
  rows: { key: string; values: (string | number)[]; sort: SortValue[] }[];
  defaultSort?: SortState;
}

/** The URL's sort (`?sort=<table>.<column>&dir=`), as the exports receive it. */
export interface SortParams {
  sort?: string | null;
  dir?: string | null;
}

export const bandLabel = (min: number, max: number) => (max >= 200 ? `${min}+` : `${min}–${max}`);
const dec = (n: number | null) => (n === null ? "—" : String(n).replace(".", ","));

export function statisticsWhen(d: Pick<StatisticsReport, "an" | "year" | "today">): string {
  return d.an ? `Anul ${d.year} (situația la ${fmt(`${d.year}-12-31`)})` : `Situația la ${fmt(d.today)}`;
}

const col = (key: string, label: string, type: SortColumn["type"] = "number"): SortColumn => ({ key, label, type });

/** The Statistici tables with their keys, sort values and default order (year tables: newest first). */
export function statisticsTableDefs(d: StatisticsReport): StatTableDef[] {
  const st = d.structure;
  const plain = (key: string, values: (string | number)[]) => ({ key, values, sort: values.map((v) => (typeof v === "number" ? v : v)) });
  return [
    {
      id: "evolutie",
      name: "Evoluție",
      columns: [
        col("an", "An"),
        col("membri", "Membri"),
        col("botez", "Botez"),
        col("transfer", "Transfer"),
        col("cerere", "Cerere"),
        col("reabilitare", "Reabilitare"),
        col("iesiri", "Ieșiri"),
        col("iesiriTransfer", "Ieșiri prin transfer"),
        col("retragere", "Retragere"),
        col("deces", "Deces"),
        col("excludere", "Excludere"),
        col("binecuvantari", "Binecuvântări"),
        col("crestere", "Creștere netă"),
      ],
      rows: d.rows.map((r) =>
        plain(String(r.year), [
          r.year,
          r.membri,
          r.intrari.botez,
          r.intrari.transfer,
          r.intrari.cerere,
          r.intrari.reprimire,
          r.iesiri.total,
          r.iesiri.transfer,
          r.iesiri.retragere,
          r.iesiri.deces,
          r.iesiri.excludere,
          r.binecuvantari,
          r.crestere,
        ]),
      ),
      defaultSort: { col: "an", dir: "desc" },
    },
    {
      id: "luni",
      name: `Pe luni ${d.year}`,
      columns: [col("luna", "Luna"), col("intrari", "Intrări"), col("iesiri", "Ieșiri")],
      // The month sorts by its number, not its name.
      rows: d.months.map((m) => ({ key: String(m.month), values: [MONTHS_L[m.month - 1], m.intrari, m.iesiri], sort: [m.month, m.intrari, m.iesiri] })),
    },
    {
      id: "varste",
      name: "Vârste",
      columns: [col("varsta", "Vârsta"), col("barbati", "Bărbați"), col("femei", "Femei"), col("total", "Total")],
      // An age band sorts by its lower bound.
      rows: st.pyramid.map((p, i) => ({ key: String(p.min), values: [bandLabel(p.min, p.max), p.M, p.F, st.bands[i].n], sort: [p.min, p.M, p.F, st.bands[i].n] })),
    },
    {
      id: "statut",
      name: "Statut și gen",
      columns: [col("statut", "Statut", "text"), col("barbati", "Bărbați"), col("femei", "Femei"), col("total", "Total"), col("casatoriti", "Căsătoriți"), col("necasatoriti", "Necăsătoriți")],
      // Minors have no marital status category: "—" (sorted last), as on the screen.
      rows: st.byStatus.map((r) =>
        r.key === "copii-minori"
          ? { key: r.key, values: [r.label, r.M, r.F, r.total, "—", "—"], sort: [r.label, r.M, r.F, r.total, null, null] }
          : plain(r.key, [r.label, r.M, r.F, r.total, r.casatoriti, r.necasatoriti]),
      ),
    },
    {
      id: "familii",
      name: "Familii",
      columns: [col("indicator", "Indicator", "text"), col("valoare", "Valoare")],
      rows: [
        ["Familii", st.families.count, st.families.count],
        ["Persoane pe familie, în medie", dec(st.families.avgSize), st.families.avgSize],
        ["Familii cu copii minori", st.families.withMinors, st.families.withMinors],
        ["Persoane singure în familie", st.families.alone, st.families.alone],
        ["Persoane fără familie", st.families.withoutFamily, st.families.withoutFamily],
        ["Adulți în evidență", st.marital.adulti, st.marital.adulti],
        ["Adulți căsătoriți", st.marital.casatoriti, st.marital.casatoriti],
        ["Adulți necăsătoriți", st.marital.necasatoriti, st.marital.necasatoriti],
        ["Adulți cu starea civilă necompletată", st.marital.necompletat, st.marital.necompletat],
        ["Vârsta medie a membrilor", dec(st.ageAvg), st.ageAvg],
        ["Vârsta mediană a membrilor", dec(st.ageMedian), st.ageMedian],
        ["Persoane fără dată de naștere (neincluse la vârste)", st.withoutBirthDate, st.withoutBirthDate],
      ].map(([label, shown, value], i) => ({ key: String(i), values: [label as string, shown as string | number], sort: [label as string, value as number | null] })),
    },
  ];
}

/** The tables in the order the screen shows them (the URL's sort for its table, else each default). */
export function statisticsTables(d: StatisticsReport, params: SortParams = {}): StatTable[] {
  return statisticsTableDefs(d).map((t) => ({
    name: t.name,
    columns: t.columns.map((c) => c.label),
    rows: orderRows(t.rows, t.columns, parseSort(params.sort, params.dir, t.id, t.columns), t.defaultSort).map((r) => r.values),
  }));
}

const tableBlock = (t: StatTable): Block => ({ type: "table", columns: t.columns, rows: t.rows.map((r) => r.map(String)) });
const heading = (text: string): Block => ({ type: "para", runs: [{ text, bold: true }] });

/** The Statistici PDF: the charts as vectors, each followed by its table. */
export function statisticsPrint(d: StatisticsReport, church: ChurchInfo, params: SortParams = {}): PrintSpec {
  // The tables follow the screen's sort; the charts stay chronological (left = oldest).
  const [evo, months, ages, status, families] = statisticsTables(d, params);
  const labels = d.rows.map((r) => String(r.year));
  const st = d.structure;
  return {
    title: `Statistici ${d.year}`,
    church,
    landscape: true,
    blocks: [
      { type: "title", text: "Statistici" },
      { type: "para", runs: [{ text: statisticsWhen(d) }] },
      { type: "chart", kind: "line", title: "Membri la sfârșitul fiecărui an", labels, series: [{ name: "Membri", values: d.rows.map((r) => r.membri) }] },
      {
        type: "chart",
        kind: "bars",
        title: "Intrări pe an, după mod",
        labels,
        series: [
          { name: "Botez", values: d.rows.map((r) => r.intrari.botez) },
          { name: "Transfer", values: d.rows.map((r) => r.intrari.transfer) },
          { name: "Cerere", values: d.rows.map((r) => r.intrari.cerere) },
          { name: "Reabilitare", values: d.rows.map((r) => r.intrari.reprimire) },
        ],
      },
      heading("Evoluție"),
      tableBlock(evo),
      {
        type: "chart",
        kind: "bars",
        title: `Intrări și ieșiri în ${d.year}, pe luni`,
        labels: d.months.map((m) => MONTHS_L[m.month - 1].slice(0, 3)),
        series: [
          { name: "Intrări", values: d.months.map((m) => m.intrari) },
          { name: "Ieșiri", values: d.months.map((m) => m.iesiri) },
        ],
      },
      tableBlock(months),
      {
        type: "chart",
        kind: "pyramid",
        title: "Piramida vârstelor",
        labels: st.pyramid.map((p) => bandLabel(p.min, p.max)),
        series: [
          { name: "Bărbați", values: st.pyramid.map((p) => p.M) },
          { name: "Femei", values: st.pyramid.map((p) => p.F) },
        ],
      },
      { type: "para", runs: [{ text: `${st.withoutBirthDate} persoane fără dată de naștere nu sunt incluse.` }] },
      tableBlock(ages),
      heading("Statut și gen"),
      tableBlock(status),
      heading("Familii și vârste"),
      tableBlock(families),
    ],
  };
}

/** "Evoluția pe 5 ani": a short table appended to the dare de seamă when asked (one line per year). */
export function evolutionText(rows: YearRow[]): string {
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
  return [
    `Evoluția pe ${rows.length} ani`,
    "An | Membri | Intrări | Ieșiri | Binecuvântări | Creștere netă",
    ...rows.map((r) => {
      const intrari = r.intrari.botez + r.intrari.transfer + r.intrari.cerere + r.intrari.reprimire;
      return `${r.year} | ${r.membri} | ${intrari} | ${r.iesiri.total} | ${r.binecuvantari} | ${sign(r.crestere)}`;
    }),
  ].join("\n");
}
