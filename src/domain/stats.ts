import { ageAt, inYear } from "@/lib/dates";
import { EVENT_TYPE_FUNERAL, EVENT_TYPE_WEDDING } from "@/lib/labels";
import type { EventRecord, PersonRecord } from "./types";

/**
 * Statistica registrului — portarea funcției `stats(year)` din prototip.
 *
 * Situația este calculată „la data” `endDate`: sfârșitul anului ales pentru anii trecuți,
 * respectiv ziua de azi pentru anul curent. Pentru anii trecuți, apartenența se reconstituie
 * retroactiv din datele de intrare și ieșire.
 *
 * Singura diferență voită față de prototip (vezi README, „Diferențe față de prototip”):
 * prototipul excludea din anii trecuți orice persoană adăugată în aplicație după acel an
 * (`createdAt`), chiar dacă avea o dată de intrare anterioară. Aici data de intrare are
 * prioritate; data înregistrării se folosește doar pentru persoanele fără dată de intrare.
 */

export const AGE_BANDS: readonly [label: string, min: number, max: number][] = [
  ["0–17", 0, 17],
  ["18–30", 18, 30],
  ["31–45", 31, 45],
  ["46–60", 46, 60],
  ["61+", 61, 200],
];

export interface StatsOptions {
  /** Anul pentru care se face situația; lipsă = anul curent (tabloul de bord). */
  year?: number;
  /** Data de azi (AAAA-LL-ZZ) în fusul orar al aplicației. */
  today: string;
}

export interface Stats {
  /** Anul pentru mișcarea anuală. */
  y: number;
  /** Data la care se calculează situația. */
  endDate: string;
  /** Persoane în evidență la endDate. */
  ev: PersonRecord[];
  membri: PersonRecord[];
  copii: PersonRecord[];
  copiiMembri: PersonRecord[];
  apart: PersonRecord[];
  prieteni: PersonRecord[];
  botezati: PersonRecord[];
  intrTransfer: PersonRecord[];
  intrBotez: PersonRecord[];
  reprimiri: PersonRecord[];
  iesiri: PersonRecord[];
  binecuv: PersonRecord[];
  nunti: EventRecord[];
  inmorm: EventRecord[];
  gen: { M: number; F: number };
  bands: [label: string, count: number][];
  /** Numărul de familii distincte (după numele de familie) în evidență. */
  fams: number;
}

export function statsEndDate(today: string, year?: number): string {
  const currentYear = Number(today.slice(0, 4));
  return year && year < currentYear ? `${year}-12-31` : today;
}

/** Persoana era în evidență la `endDate`? */
export function isInRecord(p: PersonRecord, endDate: string, historical: boolean): boolean {
  if (p.dataIesire && p.dataIesire <= endDate) return false;
  if (p.dataMembru) return p.dataMembru <= endDate;
  if (p.dataNasterii && p.dataNasterii > endDate) return false;
  // Fără dată de intrare: pentru anii trecuți folosim data înregistrării (ca prototipul).
  return !historical || !p.createdAt || p.createdAt <= endDate;
}

/**
 * @param persons toate persoanele din registru, în ordinea în care vor apărea în liste
 *                (aplicația le transmite în ordine alfabetică).
 * @param events  evenimentele din calendar (pentru nunți și înmormântări).
 */
export function computeStats(persons: PersonRecord[], events: EventRecord[], { year, today }: StatsOptions): Stats {
  const y = year || Number(today.slice(0, 4));
  const endDate = statsEndDate(today, year);
  const historical = Boolean(year);

  const age = (p: PersonRecord) => (p.dataNasterii ? ageAt(p.dataNasterii, endDate) : null);
  const minor = (p: PersonRecord) => {
    const a = age(p);
    return a !== null ? a < 18 : p.statut === "COPIL";
  };

  const ev = persons.filter((p) => isInRecord(p, endDate, historical));
  const membri = ev.filter(
    (p) => p.statut === "MEMBRU" || (p.statut === "FOST_MEMBRU" && p.dataIesire !== null && p.dataIesire > endDate),
  );
  const memberFams = new Set(membri.map((p) => p.familie).filter(Boolean));
  const copii = ev.filter(minor);
  const copiiMembri = copii.filter((p) => p.familie && memberFams.has(p.familie));
  const apart = ev.filter((p) => p.statut === "APARTINATOR");
  const prieteni = ev.filter((p) => p.statut === "PRIETEN");
  const botezati = ev.filter((p) => p.dataBotez && p.dataBotez <= endDate);

  const intrTransfer = persons.filter((p) => p.modIntrare === "TRANSFER" && inYear(p.dataMembru, y));
  const intrBotez = persons.filter((p) => inYear(p.dataBotez, y));
  const reprimiri = persons.filter((p) => p.modIntrare === "REPRIMIRE" && inYear(p.dataMembru, y));
  const iesiri = persons.filter((p) => inYear(p.dataIesire, y));
  const binecuv = persons.filter((p) => inYear(p.dataBinecuvantare, y));
  const nunti = events.filter((e) => e.tip === EVENT_TYPE_WEDDING && inYear(e.data, y));
  const inmorm = events.filter((e) => e.tip === EVENT_TYPE_FUNERAL && inYear(e.data, y));

  const gen = { M: ev.filter((p) => p.gen === "M").length, F: ev.filter((p) => p.gen === "F").length };
  const bands = AGE_BANDS.map(([label, min, max]): [string, number] => [
    label,
    ev.filter((p) => {
      const a = age(p);
      return a !== null && a >= min && a <= max;
    }).length,
  ]);
  const fams = new Set(ev.map((p) => p.familie).filter(Boolean)).size;

  return {
    y,
    endDate,
    ev,
    membri,
    copii,
    copiiMembri,
    apart,
    prieteni,
    botezati,
    intrTransfer,
    intrBotez,
    reprimiri,
    iesiri,
    binecuv,
    nunti,
    inmorm,
    gen,
    bands,
    fams,
  };
}

/** Procentul din persoanele în evidență (rotunjit), ca în tabloul de bord din prototip. */
export function percentOf(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0;
}

/** Anii disponibili în selectorul dării de seamă: anii din datele registrului + anul curent. */
export function reportYears(persons: PersonRecord[], currentYear: number): number[] {
  const years = new Set<number>();
  for (const p of persons) {
    for (const d of [p.dataMembru, p.dataBotez, p.dataIesire, p.dataBinecuvantare]) {
      if (d) years.add(Number(d.slice(0, 4)));
    }
  }
  years.add(currentYear);
  return [...years].sort((a, b) => b - a);
}
