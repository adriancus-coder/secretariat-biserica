import type { Block, PrintSpec } from "@/domain/print";
import type { MonthRow, Structure, YearRow } from "@/domain/evolution";
import type { ChurchInfo } from "@/domain/types";
import { fmt, MONTHS_L } from "./format";

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

export const bandLabel = (min: number, max: number) => (max >= 200 ? `${min}+` : `${min}–${max}`);
const dec = (n: number | null) => (n === null ? "—" : String(n).replace(".", ","));

export function statisticsWhen(d: Pick<StatisticsReport, "an" | "year" | "today">): string {
  return d.an ? `Anul ${d.year} (situația la ${fmt(`${d.year}-12-31`)})` : `Situația la ${fmt(d.today)}`;
}

export function statisticsTables(d: StatisticsReport): StatTable[] {
  const st = d.structure;
  return [
    {
      name: "Evoluție",
      columns: ["An", "Membri", "Botez", "Transfer", "Cerere", "Reabilitare", "Ieșiri", "Ieșiri transfer", "Retragere", "Deces", "Excludere", "Binecuvântări", "Creștere netă"],
      rows: d.rows.map((r) => [
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
    },
    {
      name: `Pe luni ${d.year}`,
      columns: ["Luna", "Intrări", "Ieșiri"],
      rows: d.months.map((m) => [MONTHS_L[m.month - 1], m.intrari, m.iesiri]),
    },
    {
      name: "Vârste",
      columns: ["Vârsta", "Bărbați", "Femei", "Total"],
      rows: st.pyramid.map((p, i) => [bandLabel(p.min, p.max), p.M, p.F, st.bands[i].n]),
    },
    {
      name: "Statut și gen",
      columns: ["", "Bărbați", "Femei", "Total"],
      rows: st.byStatus.map((r) => [r.label, r.M, r.F, r.total]),
    },
    {
      name: "Familii",
      columns: ["", "Valoare"],
      rows: [
        ["Familii", st.families.count],
        ["Persoane pe familie, în medie", dec(st.families.avgSize)],
        ["Familii cu copii minori", st.families.withMinors],
        ["Persoane singure în familie", st.families.alone],
        ["Persoane fără familie", st.families.withoutFamily],
        ["Vârsta medie a membrilor", dec(st.ageAvg)],
        ["Vârsta mediană a membrilor", dec(st.ageMedian)],
        ["Persoane fără dată de naștere (neincluse la vârste)", st.withoutBirthDate],
      ],
    },
  ];
}

const tableBlock = (t: StatTable): Block => ({ type: "table", columns: t.columns, rows: t.rows.map((r) => r.map(String)) });
const heading = (text: string): Block => ({ type: "para", runs: [{ text, bold: true }] });

/** The Statistici PDF: the charts as vectors, each followed by its table. */
export function statisticsPrint(d: StatisticsReport, church: ChurchInfo): PrintSpec {
  const [evo, months, ages, status, families] = statisticsTables(d);
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
