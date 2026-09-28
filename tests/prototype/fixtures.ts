/** Generator determinist de registre aleatoare + conversia în formatul prototipului. */
import type { EventRecord, PersonRecord } from "@/domain/types";
import {
  ENTRY_LABEL,
  ENTRY_MODES,
  EXIT_LABEL,
  EXIT_MODES,
  NOMEN_DEFAULTS,
  PERSON_STATUSES,
  STATUS_LABEL,
  type ExitModeKey,
} from "@/lib/labels";

/** PRNG mulberry32 — reproductibil după seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(arr: readonly T[]): T => arr[int(0, arr.length - 1)];
  const chance = (p: number) => next() < p;
  return { next, int, pick, chance };
}
export type Rng = ReturnType<typeof rng>;

const NUME = ["Popescu", "Ionescu", "Ștefănescu", "Țurcanu", "Pop", "Popa", "Avram", "Ăsan", "Munteanu", "Lungu", "Barbu"];
const PRENUME_M = ["Ion", "Andrei", "Mihai", "Ștefan", "Daniel", "Petru"];
const PRENUME_F = ["Maria", "Ana", "Elena", "Rut", "Lidia", "Ioana"];
const LOCURI = ["", "", "Râul Bistrița", "baptisteriul bisericii", "Lacul Sf. Ana"];
const BISERICI = ["", "", "Biserica Betel Oslo", "Biserica Harul Cluj"];

export function isoBetween(r: Rng, from: string, to: string): string {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  if (b <= a) return from;
  return new Date(a + Math.floor(r.next() * (b - a + 86_400_000) / 86_400_000) * 86_400_000).toISOString().slice(0, 10);
}

function maxIso(...d: (string | null)[]): string {
  return d.filter((x): x is string => Boolean(x)).sort().at(-1) ?? "1930-01-01";
}

/**
 * Persoană aleatoare, consistentă cronologic (naștere ≤ înregistrare ≤ intrare), astfel încât
 * prototipul și aplicația să aplice aceleași reguli (vezi diferența documentată în stats.ts).
 */
export function randomPerson(r: Rng, id: string, today: string, families: string[]): PersonRecord {
  const gen = r.chance(0.08) ? null : r.chance(0.5) ? "M" : "F";
  const statut = r.pick(PERSON_STATUSES);
  const dataNasterii = r.chance(0.85) ? isoBetween(r, "1935-01-01", today) : null;
  const hasEntry = r.chance(0.7);
  // Fără dată de înregistrare doar dacă lipsește și data nașterii (altfel regula „nu era încă
  // născut” din aplicație ar diferi voit de prototip — testată separat în stats.test.ts).
  const createdAt = !dataNasterii && r.chance(0.3) ? null : isoBetween(r, maxIso(dataNasterii, "2010-01-01"), today);
  const dataMembru = hasEntry ? isoBetween(r, maxIso(dataNasterii, createdAt), "2027-06-30") : null;
  const modIntrare = hasEntry && r.chance(0.85) ? r.pick(ENTRY_MODES) : null;
  const dataBotez = r.chance(0.55) ? isoBetween(r, maxIso(dataNasterii, "1960-01-01"), "2027-06-30") : null;
  const dataBinecuvantare = r.chance(0.2) ? isoBetween(r, maxIso(dataNasterii, "1990-01-01"), "2027-06-30") : null;
  const exits = r.chance(0.3);
  const dataIesire = exits ? isoBetween(r, maxIso(dataMembru, createdAt, "2012-01-01"), "2027-06-30") : null;
  const modIesire: ExitModeKey | null = exits && r.chance(0.85) ? r.pick(EXIT_MODES) : null;
  return {
    id,
    nume: r.pick(NUME),
    prenume: gen === "F" ? r.pick(PRENUME_F) : r.pick(PRENUME_M),
    statut,
    gen,
    familie: r.chance(0.8) ? r.pick(families) : "",
    rudenie: r.chance(0.8) ? r.pick(NOMEN_DEFAULTS.rudenie) : "",
    dataNasterii,
    dataMembru,
    modIntrare,
    bisericaProvenienta: modIntrare === "TRANSFER" ? r.pick(BISERICI) : "",
    dataBotez,
    locBotez: dataBotez ? r.pick(LOCURI) : "",
    dataBinecuvantare,
    dataIesire,
    modIesire,
    bisericaDestinatie: modIesire === "TRANSFER" ? r.pick(BISERICI) : "",
    createdAt,
  };
}

export function randomEvent(r: Rng, id: string): EventRecord {
  const tip = r.chance(0.35) ? r.pick(["Nuntă", "Înmormântare"]) : r.pick(NOMEN_DEFAULTS.tipuriEvenimente);
  return { id, titlu: `${tip} ${r.pick(NUME)}`, tip, data: isoBetween(r, "2015-01-01", "2027-12-31") };
}

/** Conversia unei persoane în formatul prototipului (etichete românești, '' pentru valori lipsă). */
export function toPrototypeMember(p: PersonRecord): Record<string, unknown> {
  return {
    id: p.id,
    nume: p.nume,
    prenume: p.prenume,
    statut: STATUS_LABEL[p.statut],
    familie: p.familie,
    rudenie: p.rudenie,
    dataNasterii: p.dataNasterii ?? "",
    gen: p.gen ?? "",
    telefon: "",
    email: "",
    adresa: "",
    dataMembru: p.dataMembru ?? "",
    modIntrare: p.modIntrare ? ENTRY_LABEL[p.modIntrare] : "",
    bisericaProvenienta: p.bisericaProvenienta,
    dataBotez: p.dataBotez ?? "",
    locBotez: p.locBotez,
    dataBinecuvantare: p.dataBinecuvantare ?? "",
    dataIesire: p.dataIesire ?? "",
    modIesire: p.modIesire ? EXIT_LABEL[p.modIesire] : "",
    bisericaDestinatie: p.bisericaDestinatie,
    slujire: "",
    note: "",
    createdAt: p.createdAt ?? "",
  };
}

export function toPrototypeEvent(e: EventRecord): Record<string, unknown> {
  return { id: e.id, titlu: e.titlu, tip: e.tip, data: e.data, agapa: { activ: false, contributii: [] } };
}

export interface Dataset {
  persons: PersonRecord[];
  events: EventRecord[];
  meetings: { id: string; data: string }[];
  documents: { id: string; data: string; tip: string }[];
}

export function randomDataset(seed: number, today: string, size = 40): Dataset {
  const r = rng(seed);
  const families = NUME.slice(0, r.int(3, NUME.length));
  // ID-uri nenumerice: ordinea cheilor într-un obiect JS rămâne ordinea de inserare.
  const persons = Array.from({ length: r.int(0, size) }, (_, i) => randomPerson(r, `p${i}x`, today, families));
  const events = Array.from({ length: r.int(0, 15) }, (_, i) => randomEvent(r, `e${i}x`));
  const meetings = Array.from({ length: r.int(0, 10) }, (_, i) => ({ id: `m${i}x`, data: isoBetween(r, "2018-01-01", "2027-12-31") }));
  const documents = Array.from({ length: r.int(0, 10) }, (_, i) => ({
    id: `d${i}x`,
    data: isoBetween(r, "2018-01-01", "2027-12-31"),
    tip: r.pick(["adeverinta", "botez", "raport", "scrisoare"]),
  }));
  return { persons, events, meetings, documents };
}
