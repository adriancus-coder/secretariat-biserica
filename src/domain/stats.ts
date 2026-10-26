import { ageAt, inYear } from "@/lib/dates";
import { BELIEVER_RELATIONS, EVENT_TYPE_FUNERAL, EVENT_TYPE_WEDDING } from "@/lib/labels";
import type { EventRecord, PersonRecord } from "./types";
import { ANONYMOUS_NAME } from "@/lib/anonymous";
import { churchFamilyIds } from "@/lib/families";

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
 *
 * Statut art. 28 (documented deviation): there is no "Copil" status, so a person without a birth
 * date is never a minor (the prototype used the status); baptised non-members have their own status
 * (`botezatiFara`) and the aparținători are split into kind a / b. The parity lists are unchanged.
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
  /** Aparținători kind a (Statut art. 28 alin. 1 lit. a): minors, unbaptised, in a believers' family. */
  apartA: PersonRecord[];
  /** Aparținători kind b (art. 28 alin. 1 lit. b): every other aparținător. */
  apartB: PersonRecord[];
  /** "Botezat, fără calitate de membru". */
  botezatiFara: PersonRecord[];
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
  /** The families of the church (FAMILIES-WITH-MEMBERS: at least one member at the reference date) among the persons in the record. */
  fams: number;
  /** Their ids, for the statistics that look at the families (src/domain/evolution.ts). */
  churchFamilies: string[];
  /** The other families of the persons in the record (only friends, aparținători, baptised non-members). */
  famsFaraMembri: number;
  /**
   * Marital status (not in the prototype): the adults in the record (18+ at endDate, no birth date =
   * adult; Fost membru only while still a member then), split into married (a marriage date up to
   * endDate), unmarried (the "Necăsătorit(ă)" flag, or a marriage only after endDate) and not filled
   * in. The three always add up to `adulti`.
   */
  adulti: PersonRecord[];
  casatoriti: PersonRecord[];
  necasatoriti: PersonRecord[];
  stareCivilaNecompletata: PersonRecord[];
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
    return a !== null && a < 18;
  };

  const ev = persons.filter((p) => isInRecord(p, endDate, historical));
  const membri = ev.filter(
    (p) => p.statut === "MEMBRU" || (p.statut === "FOST_MEMBRU" && p.dataIesire !== null && p.dataIesire > endDate),
  );
  // Families are records: two families with the same surname are distinct (the prototype grouped by name).
  const memberFams = new Set(membri.map((p) => p.familyId).filter(Boolean));
  const copii = ev.filter(minor);
  const copiiMembri = copii.filter((p) => p.familyId && memberFams.has(p.familyId));
  const apart = ev.filter((p) => p.statut === "APARTINATOR");
  const prieteni = ev.filter((p) => p.statut === "PRIETEN");
  // A baptism known only by its year counts by that year (not in the prototype).
  const botezati = ev.filter((p) => (p.dataBotez ? p.dataBotez <= endDate : p.botezAn !== null && p.botezAn <= y));
  const baptised = new Set(botezati.map((p) => p.id));
  const believerFams = new Set(membri.filter((p) => p.familyId && BELIEVER_RELATIONS.includes(p.rudenie)).map((p) => p.familyId));
  const apartA = apart.filter((p) => minor(p) && !baptised.has(p.id) && p.familyId !== null && believerFams.has(p.familyId));
  const kindA = new Set(apartA.map((p) => p.id));
  const apartB = apart.filter((p) => !kindA.has(p.id));
  const botezatiFara = ev.filter((p) => p.statut === "BOTEZAT_FARA_TRANSFER");

  const intrTransfer = persons.filter((p) => p.modIntrare === "TRANSFER" && inYear(p.dataMembru, y));
  const intrBotez = persons.filter((p) => (p.dataBotez ? inYear(p.dataBotez, y) : p.botezAn === y));
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
  // FAMILIES-WITH-MEMBERS: only families with a member at the reference date count (isChurchFamily).
  const membriIds = new Set(membri.map((p) => p.id));
  const churchFamilies = [...churchFamilyIds(ev, (p) => membriIds.has(p.id) && p.nume !== ANONYMOUS_NAME)];
  const fams = churchFamilies.length;
  const famsFaraMembri = new Set(ev.map((p) => p.familyId).filter(Boolean)).size - fams;

  const adulti = ev.filter((p) => !minor(p) && (p.statut !== "FOST_MEMBRU" || (p.dataIesire !== null && p.dataIesire > endDate)));
  const casatoriti = adulti.filter((p) => p.dataCasatoriei && p.dataCasatoriei <= endDate);
  const married = new Set(casatoriti.map((p) => p.id));
  const necasatoriti = adulti.filter((p) => !married.has(p.id) && (p.necasatorit || Boolean(p.dataCasatoriei)));
  const unmarried = new Set(necasatoriti.map((p) => p.id));
  const stareCivilaNecompletata = adulti.filter((p) => !married.has(p.id) && !unmarried.has(p.id));

  return {
    y,
    endDate,
    ev,
    membri,
    copii,
    copiiMembri,
    apart,
    apartA,
    apartB,
    botezatiFara,
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
    churchFamilies,
    famsFaraMembri,
    adulti,
    casatoriti,
    necasatoriti,
    stareCivilaNecompletata,
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
    if (p.botezAn) years.add(p.botezAn);
  }
  years.add(currentYear);
  return [...years].sort((a, b) => b - a);
}
