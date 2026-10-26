import { ageAt, inYear, monthsBefore } from "@/lib/dates";
import { OPTIONAL_CONSENTS, PARENT_RELATIONS, PRIETENI_TITLE, type ConsentKindKey } from "@/lib/labels";
import type { ConsentState } from "@/lib/consents";
import { computeStats, type Stats } from "./stats";
import type { EventRecord, PersonRecord } from "./types";

/**
 * Person categories behind every statistic: each returns the ids of the persons it counts. The
 * categories shown on Acasă and in the dare de seamă reuse the lists of computeStats itself (not
 * changed here), so a list always has exactly as many rows as the number next to it. Pure.
 */

export const CATEGORY_GROUPS = ["Statut", "Copii", "Stare civilă", "Botez și intrare", "Vârstă", "Slujire", "Familie", "Ieșiri", "Acorduri"] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export interface CategoryDef {
  key: string;
  label: string;
  group: CategoryGroup;
  /** Counts events of the selected year (else: the situation at the reference date). */
  yearly?: boolean;
}

/** The age bands of the filter menu and the export; any "varsta-<min>-<max>" key is understood. */
export const CATEGORY_AGE_BANDS: readonly [min: number, max: number][] = [
  [0, 13],
  [14, 17],
  [18, 30],
  [31, 45],
  [46, 64],
  [65, 200],
];

/** "acord-photos-da": the persons with that answer to an optional consent (a withdrawn one counts as "nu"). */
export const consentKey = (kind: string, answer: "da" | "nu" | "neexprimat") => `acord-${kind.toLowerCase()}-${answer}`;
const CONSENT_SHORT: Record<string, string> = { PHOTOS: "Fotografii", BIRTHDAY: "Ziua de naștere", CONTACT: "Anunțuri", DIRECTORY: "Lista de contacte" };
const CONSENT_KEY = /^acord-(photos|birthday|contact|directory)-(da|nu|neexprimat)$/;

const ageLabel = (min: number, max: number) => (max >= 200 ? `${min}+ ani` : `${min}–${max} ani`);
export const ageKey = (min: number, max: number) => `varsta-${min}-${max}`;

export const CATEGORIES: readonly CategoryDef[] = [
  { key: "toti", label: "Toți cei în evidență", group: "Statut" },
  { key: "membri", label: "Membri", group: "Statut" },
  { key: "apartinatori", label: "Aparținători", group: "Statut" },
  { key: "apartinatori-a", label: "Aparținători a) minori nebotezați din familii de credincioși", group: "Statut" },
  { key: "apartinatori-b", label: "Aparținători b) nebotezați hotărâți", group: "Statut" },
  { key: "botezati-fara-calitate", label: "Botezați fără calitate de membru", group: "Statut" },
  { key: "prieteni", label: PRIETENI_TITLE, group: "Statut" },
  { key: "barbati", label: "Bărbați", group: "Statut" },
  { key: "femei", label: "Femei", group: "Statut" },
  { key: "copii-minori", label: "Copii minori", group: "Copii" },
  { key: "copii-membri", label: "Copii ai membrilor", group: "Copii" },
  { key: "copii-apartinatori", label: "Copii ai aparținătorilor", group: "Copii" },
  { key: "copii-fara-familie", label: "Copii fără familie", group: "Copii" },
  { key: "adulti", label: "Adulți (18+)", group: "Stare civilă" },
  { key: "casatoriti", label: "Căsătoriți", group: "Stare civilă" },
  { key: "necasatoriti", label: "Necăsătoriți", group: "Stare civilă" },
  { key: "stare-civila-necompletata", label: "Stare civilă necompletată", group: "Stare civilă" },
  { key: "botezati", label: "Botezați", group: "Botez și intrare" },
  { key: "nebotezati", label: "Nebotezați", group: "Botez și intrare" },
  { key: "intrati-botez", label: "Botezați în anul ales", group: "Botez și intrare", yearly: true },
  { key: "intrati-transfer", label: "Intrați prin transfer în anul ales", group: "Botez și intrare", yearly: true },
  { key: "intrati-cerere", label: "Intrați prin cerere de membralitate în anul ales", group: "Botez și intrare", yearly: true },
  { key: "reprimiti", label: "Reabilitați spiritual în anul ales", group: "Botez și intrare", yearly: true },
  { key: "binecuvantati", label: "Binecuvântați în anul ales", group: "Botez și intrare", yearly: true },
  ...CATEGORY_AGE_BANDS.map(([min, max]): CategoryDef => ({ key: ageKey(min, max), label: ageLabel(min, max), group: "Vârstă" })),
  { key: "fara-data-nasterii", label: "Fără dată de naștere", group: "Vârstă" },
  { key: "comitet", label: "În comitet", group: "Slujire" },
  { key: "cu-functie", label: "Cu funcție sau slujire", group: "Slujire" },
  { key: "fara-familie", label: "Fără familie", group: "Familie" },
  { key: "singuri-in-familie", label: "Singuri în familie (familie de o persoană)", group: "Familie" },
  { key: "capi-familie", label: "Capi de familie", group: "Familie" },
  { key: "plecati-temporar", label: "Plecați temporar", group: "Statut" },
  { key: "plecati-3-luni", label: "Plecați de peste 3 luni", group: "Statut" },
  { key: "plecati-6-luni", label: "Plecați de peste 6 luni (trebuie cerut transferul)", group: "Statut" },
  { key: "iesiti-an", label: "Ieșiți în anul ales", group: "Ieșiri", yearly: true },
  { key: "iesiti-transfer", label: "Ieșiți prin transfer în anul ales", group: "Ieșiri", yearly: true },
  { key: "iesiti-retragere", label: "Retrași în anul ales", group: "Ieșiri", yearly: true },
  { key: "iesiti-deces", label: "Decedați în anul ales", group: "Ieșiri", yearly: true },
  { key: "iesiti-excludere", label: "Excluși în anul ales", group: "Ieșiri", yearly: true },
  { key: "iesiti", label: "Foști membri / ieșiți (oricând)", group: "Ieșiri" },
  { key: "nota-confirmata", label: "Nota de informare confirmată", group: "Acorduri" },
  { key: "nota-neconfirmata", label: "Fără confirmarea notei de informare", group: "Acorduri" },
  ...OPTIONAL_CONSENTS.flatMap((k): CategoryDef[] =>
    (["da", "nu", "neexprimat"] as const).map((a) => ({ key: consentKey(k, a), label: `${CONSENT_SHORT[k]}: ${a === "da" ? "Da" : a === "nu" ? "Nu" : "Neexprimat"}`, group: "Acorduri" })),
  ),
];

const AGE_KEY = /^varsta-(\d{1,3})-(\d{1,3})$/;

/** The definition of a key (also any "varsta-<min>-<max>"), or undefined. */
export function categoryDef(key: string): CategoryDef | undefined {
  const known = CATEGORIES.find((c) => c.key === key);
  if (known) return known;
  const m = AGE_KEY.exec(key);
  if (m && Number(m[1]) <= Number(m[2])) return { key, label: ageLabel(Number(m[1]), Number(m[2])), group: "Vârstă" };
  return undefined;
}

export interface CategoryInput {
  /** Every person of the register, in the order the lists show them. */
  persons: PersonRecord[];
  /** Weddings and funerals (computeStats needs them). */
  events: EventRecord[];
  today: string;
  /** The selected year exactly as the statistics got it (undefined = the situation today). */
  year?: number;
  /** Persons with the committee flag. */
  committee: ReadonlySet<string>;
  /** Family heads. */
  heads: ReadonlySet<string>;
  /** Role id → its current holders. */
  holders: ReadonlyMap<string, ReadonlySet<string>>;
  /** Person id → the current state of each consent (absent = Neexprimat). */
  consents?: ReadonlyMap<string, Partial<Record<ConsentKindKey, ConsentState>>>;
}

export interface CategoryContext {
  stats: Stats;
  /** The ids of one category ("" functie = any role for cu-functie), or null for an unknown key. */
  ids(key: string, functie?: string): string[] | null;
}

export function categoryContext(input: CategoryInput): CategoryContext {
  const s = computeStats(input.persons, input.events, { year: input.year, today: input.today });
  const ids = (list: PersonRecord[]) => list.map((p) => p.id);
  const inRecord = (pred: (p: PersonRecord) => boolean) => ids(s.ev.filter(pred));
  const age = (p: PersonRecord) => (p.dataNasterii ? ageAt(p.dataNasterii, s.endDate) : null);
  // Same family rule as computeStats: a family counts as a member family when any member of it is a member.
  const memberFams = new Set(s.membri.map((p) => p.familyId).filter(Boolean));
  // An aparținător family: its head or the spouse is an aparținător, and nobody in it is a member.
  const apartFams = new Set(s.apart.filter((p) => PARENT_RELATIONS.includes(p.rudenie)).map((p) => p.familyId).filter((f) => f && !memberFams.has(f)));
  const baptised = new Set(ids(s.botezati));
  const anyHolder = new Set([...input.holders.values()].flatMap((set) => [...set]));
  // Members of each family among the persons in the record.
  const familySize = new Map<string, number>();
  for (const p of s.ev) if (p.familyId) familySize.set(p.familyId, (familySize.get(p.familyId) ?? 0) + 1);

  return {
    stats: s,
    ids(key, functie = "") {
      switch (key) {
        case "toti":
          return ids(s.ev);
        case "membri":
          return ids(s.membri);
        case "apartinatori":
          return ids(s.apart);
        case "apartinatori-a":
          return ids(s.apartA);
        case "apartinatori-b":
          return ids(s.apartB);
        case "botezati-fara-calitate":
          return ids(s.botezatiFara);
        case "prieteni":
          return ids(s.prieteni);
        case "barbati":
          return inRecord((p) => p.gen === "M");
        case "femei":
          return inRecord((p) => p.gen === "F");
        case "copii-minori":
          return ids(s.copii);
        case "copii-membri":
          return ids(s.copiiMembri);
        case "copii-apartinatori":
          return ids(s.copii.filter((p) => p.familyId && apartFams.has(p.familyId)));
        case "copii-fara-familie":
          return ids(s.copii.filter((p) => !p.familyId));
        case "adulti":
          return ids(s.adulti);
        case "casatoriti":
          return ids(s.casatoriti);
        case "necasatoriti":
          return ids(s.necasatoriti);
        case "stare-civila-necompletata":
          return ids(s.stareCivilaNecompletata);
        case "botezati":
          return ids(s.botezati);
        case "nebotezati":
          return inRecord((p) => !baptised.has(p.id));
        case "intrati-botez":
          return ids(s.intrBotez);
        case "intrati-transfer":
          return ids(s.intrTransfer);
        case "intrati-cerere":
          return ids(input.persons.filter((p) => p.modIntrare === "CERERE_MEMBRALITATE" && inYear(p.dataMembru, s.y)));
        case "reprimiti":
          return ids(s.reprimiri);
        case "binecuvantati":
          return ids(s.binecuv);
        case "fara-data-nasterii":
          return inRecord((p) => !p.dataNasterii);
        case "comitet":
          return inRecord((p) => input.committee.has(p.id));
        case "cu-functie": {
          const set = functie ? input.holders.get(functie) : anyHolder;
          return inRecord((p) => Boolean(set?.has(p.id)));
        }
        case "fara-familie":
          return inRecord((p) => !p.familyId);
        case "capi-familie":
          return inRecord((p) => input.heads.has(p.id));
        case "iesiti-an":
          return ids(s.iesiri);
        case "iesiti-transfer":
          return ids(s.iesiri.filter((p) => p.modIesire === "TRANSFER"));
        case "iesiti-retragere":
          return ids(s.iesiri.filter((p) => p.modIesire === "RETRAGERE"));
        case "iesiti-deces":
          return ids(s.iesiri.filter((p) => p.modIesire === "DECES"));
        case "iesiti-excludere":
          return ids(s.iesiri.filter((p) => p.modIesire === "EXCLUDERE"));
        case "singuri-in-familie":
          return inRecord((p) => Boolean(p.familyId) && familySize.get(p.familyId!) === 1);
        case "iesiti":
          return ids(input.persons.filter((p) => p.dataIesire !== null || p.statut === "FOST_MEMBRU"));
        case "nota-confirmata":
          return inRecord((p) => input.consents?.get(p.id)?.INFO_NOTE === "DA");
        case "nota-neconfirmata":
          return inRecord((p) => input.consents?.get(p.id)?.INFO_NOTE !== "DA");
        // Statut art. 23 alin. 4–5: temporarily away; after 6 months the transfer must be asked for.
        case "plecati-temporar":
          return inRecord((p) => Boolean(p.plecatDin && p.plecatDin <= s.endDate));
        case "plecati-3-luni":
          return inRecord((p) => Boolean(p.plecatDin && p.plecatDin <= monthsBefore(s.endDate, 3)));
        case "plecati-6-luni":
          return inRecord((p) => Boolean(p.plecatDin && p.plecatDin <= monthsBefore(s.endDate, 6)));
      }
      const c = CONSENT_KEY.exec(key);
      if (c) {
        const kind = c[1].toUpperCase() as ConsentKindKey;
        const want = c[2];
        return inRecord((p) => {
          const st = input.consents?.get(p.id)?.[kind];
          return want === "da" ? st === "DA" : want === "nu" ? st === "NU" || st === "RETRAS" : st === undefined || st === "NEEXPRIMAT";
        });
      }
      const m = AGE_KEY.exec(key);
      if (!m) return null;
      const [min, max] = [Number(m[1]), Number(m[2])];
      return inRecord((p) => {
        const a = age(p);
        return a !== null && a >= min && a <= max;
      });
    },
  };
}

export type CombineMode = "oricare" | "toate";

/**
 * Several categories combined: "oricare" = in any of them (union, default), "toate" = in all of them
 * (intersection). Unknown keys are ignored. The ids keep the order of `persons`.
 */
export function combineCategories(ctx: CategoryContext, persons: PersonRecord[], keys: string[], mode: CombineMode = "oricare", functie = ""): string[] {
  const sets = keys.map((k) => ctx.ids(k, functie)).filter((x): x is string[] => x !== null).map((l) => new Set(l));
  if (!sets.length) return [];
  const keep = (id: string) => (mode === "toate" ? sets.every((s) => s.has(id)) : sets.some((s) => s.has(id)));
  return persons.filter((p) => keep(p.id)).map((p) => p.id);
}
