/**
 * Etichete românești pentru valorile fixe din modelul de date (identice cu listele din prototip)
 * și nomenclatoarele implicite.
 *
 * Fișierul nu depinde de clientul Prisma, ca să poată fi folosit și în componentele de client.
 */

export const PERSON_STATUSES = ["MEMBRU", "APARTINATOR", "PRIETEN", "COPIL", "FOST_MEMBRU"] as const;
export type PersonStatusKey = (typeof PERSON_STATUSES)[number];
export const STATUS_LABEL: Record<PersonStatusKey, string> = {
  MEMBRU: "Membru",
  APARTINATOR: "Aparținător",
  PRIETEN: "Prieten",
  COPIL: "Copil",
  FOST_MEMBRU: "Fost membru",
};

export const ENTRY_MODES = ["BOTEZ", "TRANSFER", "NASCUT_IN_BISERICA", "REPRIMIRE", "ALTUL"] as const;
export type EntryModeKey = (typeof ENTRY_MODES)[number];
export const ENTRY_LABEL: Record<EntryModeKey, string> = {
  BOTEZ: "Botez",
  TRANSFER: "Transfer",
  NASCUT_IN_BISERICA: "Născut în biserică",
  REPRIMIRE: "Reprimire",
  ALTUL: "Altul",
};

export const EXIT_MODES = ["TRANSFER", "RETRAGERE", "DECES", "EXCLUDERE", "ALTUL"] as const;
export type ExitModeKey = (typeof EXIT_MODES)[number];
export const EXIT_LABEL: Record<ExitModeKey, string> = {
  TRANSFER: "Transfer",
  RETRAGERE: "Retragere",
  DECES: "Deces",
  EXCLUDERE: "Excludere",
  ALTUL: "Altul",
};

export const GENDERS = ["M", "F"] as const;
export type GenderKey = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<GenderKey, string> = { M: "Masculin", F: "Feminin" };

export const DOCUMENT_TYPES = ["adeverinta", "botez", "binecuvantare", "recomandare", "scrisoare", "raport"] as const;
export type DocumentTypeKey = (typeof DOCUMENT_TYPES)[number];
/** DTYPES din prototip. */
export const DOCUMENT_TYPE_LABEL: Record<DocumentTypeKey, string> = {
  adeverinta: "Adeverință de membru",
  botez: "Certificat de botez",
  binecuvantare: "Certificat de binecuvântare a copilului",
  recomandare: "Scrisoare de recomandare (transfer)",
  scrisoare: "Scrisoare / adresă oficială",
  raport: "Dare de seamă anuală",
};
/** Titlul tipărit pe document (docHtml din prototip). */
export const DOCUMENT_HEADING: Record<DocumentTypeKey, string> = {
  adeverinta: "Adeverință",
  botez: "Certificat de botez",
  binecuvantare: "Certificat de binecuvântare",
  recomandare: "Scrisoare de recomandare",
  scrisoare: "",
  raport: "Dare de seamă anuală",
};

export const ROLES = ["ADMIN", "SECRETAR", "VIZUALIZARE"] as const;
export type RoleKey = (typeof ROLES)[number];
export const ROLE_LABEL: Record<RoleKey, string> = {
  ADMIN: "Administrator",
  SECRETAR: "Secretar",
  VIZUALIZARE: "Vizualizare",
};
export const ROLE_DESCRIPTION: Record<RoleKey, string> = {
  ADMIN: "Acces complet: date, setări, utilizatori, import.",
  SECRETAR: "Adaugă și modifică date, emite documente, exportă.",
  VIZUALIZARE: "Doar consultare și tipărire.",
};

/** Nomenclatoarele implicite (NOMEN_DEF din prototip). */
export const NOMEN_DEFAULTS = {
  tipuriSedinte: ["Comitet", "Adunare generală", "Frați slujitori", "Diaconie", "Altele"],
  tipuriEvenimente: [
    "Serviciu divin",
    "Evanghelizare",
    "Botez",
    "Binecuvântare copil",
    "Ordinare",
    "Agapă",
    "Conferință",
    "Tineret",
    "Nuntă",
    "Înmormântare",
    "Altele",
  ],
  tipuriMentiuni: ["Generală", "Pastorală", "Disciplină", "Familie", "Slujire", "Altele"],
  rudenie: ["Cap de familie", "Soție", "Fiu", "Fiică", "Părinte", "Altul"],
} as const;
export type NomenKey = keyof typeof NOMEN_DEFAULTS;

export type Nomenclatures = Record<NomenKey, string[]>;

/** Valorile efective: cele salvate, sau cele implicite dacă lista salvată e goală (nomen() din prototip). */
export function resolveNomen(saved: Partial<Record<NomenKey, string[] | null | undefined>>): Nomenclatures {
  const pick = (k: NomenKey) => {
    const v = saved[k];
    return v && v.length ? [...v] : [...NOMEN_DEFAULTS[k]];
  };
  return {
    tipuriSedinte: pick("tipuriSedinte"),
    tipuriEvenimente: pick("tipuriEvenimente"),
    tipuriMentiuni: pick("tipuriMentiuni"),
    rudenie: pick("rudenie"),
  };
}

/** Gradele de rudenie considerate „părinți” în certificatul de binecuvântare. */
export const PARENT_RELATIONS = ["Cap de familie", "Soție", "Părinte"];
export const HEAD_OF_FAMILY = "Cap de familie";

/** Tipurile de eveniment numărate în darea de seamă. */
export const EVENT_TYPE_WEDDING = "Nuntă";
export const EVENT_TYPE_FUNERAL = "Înmormântare";

/** Caută cheia pentru o etichetă (import din formatul prototipului); acceptă și cheia însăși. */
export function keyForLabel<K extends string>(labels: Record<K, string>, value: string): K | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const entries = Object.entries(labels) as [K, string][];
  const byLabel = entries.find(([, l]) => l.toLowerCase() === v.toLowerCase());
  if (byLabel) return byLabel[0];
  const byKey = entries.find(([k]) => k.toLowerCase() === v.toLowerCase());
  return byKey?.[0];
}
