/**
 * Etichete românești pentru valorile fixe din modelul de date (identice cu listele din prototip)
 * și nomenclatoarele implicite.
 *
 * Fișierul nu depinde de clientul Prisma, ca să poată fi folosit și în componentele de client.
 */

/** Statut art. 28. Being a minor is computed from the birth date (there is no "Copil" status). */
export const PERSON_STATUSES = ["MEMBRU", "APARTINATOR", "PRIETEN", "BOTEZAT_FARA_TRANSFER", "FOST_MEMBRU"] as const;
export type PersonStatusKey = (typeof PERSON_STATUSES)[number];
export const STATUS_LABEL: Record<PersonStatusKey, string> = {
  MEMBRU: "Membru",
  APARTINATOR: "Aparținător",
  PRIETEN: "Prieten",
  BOTEZAT_FARA_TRANSFER: "Botezat, fără calitate de membru",
  FOST_MEMBRU: "Fost membru",
};
/** One line per status on the person form (Statut art. 20, 22, 24, 28). */
export const STATUS_HINT: Record<PersonStatusKey, string> = {
  MEMBRU: "Botezat în apă și primit în biserică (prin botez, transfer sau reabilitare spirituală).",
  APARTINATOR:
    "Nebotezat: minor dintr-o familie de credincioși sau persoană care frecventează și s-a hotărât să-L urmeze pe Hristos (art. 28).",
  PRIETEN: "Prieten al casei Domnului: nebotezat, frecventează biserica, încă nu este aparținător.",
  BOTEZAT_FARA_TRANSFER: "Botezat (de exemplu în altă biserică), dar fără calitate de membru aici: nu a cerut transferul.",
  FOST_MEMBRU: "A ieșit din evidența membrilor (retragere, transfer, excludere).",
};
/** The aparținător kind (Statut art. 28 alin. 1), derived, never stored. */
export const APARTINATOR_KIND_LABEL = {
  a: "minor nebotezat din familie de credincioși",
  b: "nebotezat hotărât să-L urmeze pe Hristos",
} as const;
/** Relations that make a member the child's parent in a believers' family (head, spouse, parent). */
export const BELIEVER_RELATIONS = ["Cap de familie", "Soție", "Soț", "Părinte"];

export const ENTRY_MODES = ["BOTEZ", "TRANSFER", "NASCUT_IN_BISERICA", "REPRIMIRE", "CERERE_MEMBRALITATE", "ALTUL"] as const;
export type EntryModeKey = (typeof ENTRY_MODES)[number];
export const ENTRY_LABEL: Record<EntryModeKey, string> = {
  BOTEZ: "Botez",
  TRANSFER: "Transfer",
  NASCUT_IN_BISERICA: "Născut în biserică",
  REPRIMIRE: "Reprimire",
  CERERE_MEMBRALITATE: "Cerere de membralitate",
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

export const APPLICATION_KINDS = ["TRANSFER", "BOTEZ", "CERERE_MEMBRALITATE", "ALTUL"] as const;
export type ApplicationKindKey = (typeof APPLICATION_KINDS)[number];
export const APPLICATION_KIND_LABEL: Record<ApplicationKindKey, string> = {
  TRANSFER: "Transfer de la altă biserică",
  BOTEZ: "Botez nou-testamentar",
  CERERE_MEMBRALITATE: "Cerere de membralitate",
  ALTUL: "Altul",
};

export const APPLICATION_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type ApplicationStatusKey = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatusKey, string> = {
  PENDING: "În așteptare",
  ACCEPTED: "Acceptată",
  REJECTED: "Respinsă",
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
  rudenie: ["Cap de familie", "Soție", "Soț", "Fiu", "Fiică", "Părinte", "Altul"],
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

/**
 * The parents named in the blessing certificate ("din părinții …"): the family's head and spouse.
 * The prototype used ["Cap de familie", "Soție", "Părinte"] on the family text (see README).
 */
export const PARENT_RELATIONS = ["Cap de familie", "Soție", "Soț"];
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
