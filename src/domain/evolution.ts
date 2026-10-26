import { ageAt, inYear } from "@/lib/dates";
import { CATEGORY_AGE_BANDS, categoryContext, type CategoryInput } from "./categories";
import type { PersonRecord } from "./types";
import { PRIETENI_TITLE } from "@/lib/labels";

/**
 * The "Statistici" page: the evolution over the years and the structure of the church, from the
 * dates in the register. Every number is the size of a category (src/domain/categories.ts), so it
 * opens the same list. Pure.
 */

export interface YearRow {
  year: number;
  /** undefined for the current year: its figures are the situation today, as on Acasă. */
  an: number | undefined;
  membri: number;
  intrari: { botez: number; transfer: number; cerere: number; reprimire: number };
  iesiri: { transfer: number; retragere: number; deces: number; excludere: number; total: number };
  binecuvantari: number;
  /** Members now minus members at the end of the year before. */
  crestere: number;
}

/** The category of each column of the evolution table. */
export const EVOLUTION_KEYS = {
  membri: "membri",
  botez: "intrati-botez",
  transfer: "intrati-transfer",
  cerere: "intrati-cerere",
  reprimire: "reprimiti",
  iesiriTransfer: "iesiti-transfer",
  retragere: "iesiti-retragere",
  deces: "iesiti-deces",
  excludere: "iesiti-excludere",
  iesiri: "iesiti-an",
  binecuvantari: "binecuvantati",
} as const;

/** `years` years ending with `lastYear` (the current year counts as "today"). */
export function evolution(input: Omit<CategoryInput, "year">, lastYear: number, years = 10): YearRow[] {
  const current = Number(input.today.slice(0, 4));
  const count = (an: number | undefined, key: string) => categoryContext({ ...input, year: an }).ids(key)!.length;
  const rows: YearRow[] = [];
  let previous = count(lastYear - years < current ? lastYear - years : undefined, "membri");
  for (let y = lastYear - years + 1; y <= lastYear; y++) {
    const an = y === current ? undefined : y;
    const ctx = categoryContext({ ...input, year: an });
    const n = (k: string) => ctx.ids(k)!.length;
    const membri = n("membri");
    rows.push({
      year: y,
      an,
      membri,
      intrari: { botez: n("intrati-botez"), transfer: n("intrati-transfer"), cerere: n("intrati-cerere"), reprimire: n("reprimiti") },
      iesiri: {
        transfer: n("iesiti-transfer"),
        retragere: n("iesiti-retragere"),
        deces: n("iesiti-deces"),
        excludere: n("iesiti-excludere"),
        total: n("iesiti-an"),
      },
      binecuvantari: n("binecuvantati"),
      crestere: membri - previous,
    });
    previous = membri;
  }
  return rows;
}

export interface MonthRow {
  month: number;
  intrari: number;
  iesiri: number;
}

/** Entries (baptism, transfer, application, readmission) and exits of a year, by month. */
export function byMonth(persons: PersonRecord[], year: number): MonthRow[] {
  const rows = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, intrari: 0, iesiri: 0 }));
  for (const p of persons) {
    if (p.dataBotez && inYear(p.dataBotez, year)) rows[Number(p.dataBotez.slice(5, 7)) - 1].intrari++;
    if (p.dataMembru && inYear(p.dataMembru, year) && (p.modIntrare === "TRANSFER" || p.modIntrare === "CERERE_MEMBRALITATE" || p.modIntrare === "REPRIMIRE")) {
      rows[Number(p.dataMembru.slice(5, 7)) - 1].intrari++;
    }
    if (p.dataIesire && inYear(p.dataIesire, year)) rows[Number(p.dataIesire.slice(5, 7)) - 1].iesiri++;
  }
  return rows;
}

export interface Structure {
  /** Per age band (CATEGORY_AGE_BANDS): men and women with a birth date. */
  pyramid: { min: number; max: number; M: number; F: number }[];
  /** Persons in the record without a birth date (left out of the pyramid and the ages). */
  withoutBirthDate: number;
  /** Persons with a birth date but no gender (in the bands, not in the pyramid). */
  withoutGender: number;
  ageAvg: number | null;
  ageMedian: number | null;
  bands: { min: number; max: number; n: number }[];
  /** Membri / aparținători / prieteni / copii by gender, and the married / unmarried adults of each. */
  byStatus: { key: string; label: string; M: number; F: number; total: number; casatoriti: number; necasatoriti: number }[];
  /** The adults in the record by marital status (the three add up to `adulti`). */
  marital: { adulti: number; casatoriti: number; necasatoriti: number; necompletat: number };
  /** Only the families of the church (FAMILIES-WITH-MEMBERS); `withoutMembers` = the others. */
  families: { count: number; withoutMembers: number; avgSize: number | null; withMinors: number; alone: number; withoutFamily: number };
}

export function structure(input: CategoryInput): Structure {
  const ctx = categoryContext(input);
  const s = ctx.stats;
  const age = (p: PersonRecord) => ageAt(p.dataNasterii!, s.endDate);
  const dated = s.ev.filter((p) => p.dataNasterii);
  const inBand = (p: PersonRecord, min: number, max: number) => age(p) >= min && age(p) <= max;
  const memberAges = s.membri.filter((p) => p.dataNasterii).map(age).sort((a, b) => a - b);
  const median =
    memberAges.length === 0
      ? null
      : memberAges.length % 2
        ? memberAges[(memberAges.length - 1) / 2]
        : (memberAges[memberAges.length / 2 - 1] + memberAges[memberAges.length / 2]) / 2;
  const men = new Set(ctx.ids("barbati"));
  const women = new Set(ctx.ids("femei"));
  const married = new Set(ctx.ids("casatoriti"));
  const unmarried = new Set(ctx.ids("necasatoriti"));
  const byGender = (key: string, label: string) => {
    const list = ctx.ids(key)!;
    const count = (set: Set<string>) => list.filter((id) => set.has(id)).length;
    return { key, label, M: count(men), F: count(women), total: list.length, casatoriti: count(married), necasatoriti: count(unmarried) };
  };
  const famMembers = new Map<string, PersonRecord[]>();
  for (const p of s.ev) if (p.familyId) famMembers.set(p.familyId, [...(famMembers.get(p.familyId) ?? []), p]);
  const minors = new Set(ctx.ids("copii-minori"));
  const church = new Set(s.churchFamilies);
  const famLists = [...famMembers].filter(([id]) => church.has(id)).map(([, l]) => l);
  return {
    pyramid: CATEGORY_AGE_BANDS.map(([min, max]) => ({
      min,
      max,
      M: dated.filter((p) => p.gen === "M" && inBand(p, min, max)).length,
      F: dated.filter((p) => p.gen === "F" && inBand(p, min, max)).length,
    })),
    withoutBirthDate: s.ev.length - dated.length,
    withoutGender: dated.filter((p) => !p.gen).length,
    ageAvg: memberAges.length ? Math.round((memberAges.reduce((a, b) => a + b, 0) / memberAges.length) * 10) / 10 : null,
    ageMedian: median,
    bands: CATEGORY_AGE_BANDS.map(([min, max]) => ({ min, max, n: dated.filter((p) => inBand(p, min, max)).length })),
    byStatus: [
      byGender("membri", "Membri"),
      byGender("apartinatori", "Aparținători"),
      byGender("apartinatori-a", "– a) minori din familii de credincioși"),
      byGender("apartinatori-b", "– b) nebotezați hotărâți"),
      byGender("botezati-fara-calitate", "Botezați fără calitate de membru"),
      byGender("prieteni", PRIETENI_TITLE),
      byGender("copii-minori", "Copii minori"),
    ],
    marital: { adulti: s.adulti.length, casatoriti: s.casatoriti.length, necasatoriti: s.necasatoriti.length, necompletat: s.stareCivilaNecompletata.length },
    families: {
      count: famLists.length,
      withoutMembers: famMembers.size - famLists.length,
      avgSize: famLists.length ? Math.round((famLists.reduce((a, l) => a + l.length, 0) / famLists.length) * 10) / 10 : null,
      withMinors: famLists.filter((l) => l.some((p) => minors.has(p.id))).length,
      alone: ctx.ids("singuri-in-familie")!.length,
      withoutFamily: ctx.ids("fara-familie")!.length,
    },
  };
}
