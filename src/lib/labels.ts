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
  PRIETEN: "Prieten al casei Domnului (nebotezat)",
  BOTEZAT_FARA_TRANSFER: "Botezat, fără calitate de membru",
  FOST_MEMBRU: "Fost membru",
};
/** The short form where the long one does not fit (tags on list rows and member rows). */
export const STATUS_LABEL_SHORT: Record<PersonStatusKey, string> = { ...STATUS_LABEL, PRIETEN: "Prieten (nebotezat)" };
/** Counted (cards, statistics): "12 prieteni ai casei Domnului (nebotezați)". */
export const PRIETENI_LABEL = "prieteni ai casei Domnului (nebotezați)";
/** The same, at the start of a line or a table row. */
export const PRIETENI_TITLE = "Prieteni ai casei Domnului (nebotezați)";
/** The JSON backup keeps the prototype's word (like "Reprimire"), so older files and the prototype stay compatible. */
export const PROTOTYPE_STATUS_LABEL: Record<PersonStatusKey, string> = { ...STATUS_LABEL, PRIETEN: "Prieten" };
/** Older labels still accepted by the import (JSON backup), all → PRIETEN. */
const STATUS_ALIASES: Record<string, PersonStatusKey> = { prieten: "PRIETEN", "prieten al casei domnului": "PRIETEN", "prieten (nebotezat)": "PRIETEN" };
/** The status for a label of a file: the current label, an older one, or the key itself. */
export function statusForLabel(value: string): PersonStatusKey | undefined {
  return keyForLabel(STATUS_LABEL, value) ?? STATUS_ALIASES[value.trim().toLowerCase().replace(/\s+/g, " ")];
}
/** One line per status on the person form (Statut art. 20, 22, 24, 28). */
export const STATUS_HINT: Record<PersonStatusKey, string> = {
  MEMBRU: "Botezat în apă și primit în biserică (prin botez, transfer sau reabilitare spirituală).",
  APARTINATOR:
    "Nebotezat: minor dintr-o familie de credincioși sau persoană care frecventează și s-a hotărât să-L urmeze pe Hristos (art. 28).",
  PRIETEN: "Nebotezat, frecventează biserica, dar încă nu și-a exprimat hotărârea de a-L urma pe Hristos; când o face, devine aparținător (art. 28 lit. b).",
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
  // Statut art. 20 lit. c.
  REPRIMIRE: "Reabilitare spirituală",
  CERERE_MEMBRALITATE: "Cerere de membralitate",
  ALTUL: "Altul",
};

/** The prototype's labels, kept in the JSON backup so older readers and the prototype understand it. */
export const PROTOTYPE_ENTRY_LABEL: Record<EntryModeKey, string> = { ...ENTRY_LABEL, REPRIMIRE: "Reprimire" };

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

export const APPLICATION_STATUSES = ["PENDING", "PROPUSA", "ACCEPTED", "REJECTED"] as const;
export type ApplicationStatusKey = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatusKey, string> = {
  PENDING: "În așteptare",
  PROPUSA: "La pastor, de aprobat",
  ACCEPTED: "Acceptată",
  REJECTED: "Respinsă",
};

/** Pastor proposals for a person (Statut art. 23 alin. 3): entry by Reabilitare spirituală, exit by Excludere. */
export const PERSON_PROPOSAL_LABEL = { REABILITARE: "Reabilitare spirituală", EXCLUDERE: "Excludere" } as const;
export const PROPOSAL_STATUS_LABEL = { PROPUSA: "La pastor, de confirmat", ACCEPTED: "Confirmată de pastor", REJECTED: "Respinsă de pastor" } as const;

export const GENDERS = ["M", "F"] as const;
export type GenderKey = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<GenderKey, string> = { M: "Masculin", F: "Feminin" };

/** Pastor approval of a registered document (Statut art. 38–39). */
export const DOCUMENT_STATES = ["CIORNA", "DE_SEMNAT", "APROBAT", "RESPINS"] as const;
export type DocumentStateKey = (typeof DOCUMENT_STATES)[number];
export const DOCUMENT_STATE_LABEL: Record<DocumentStateKey, string> = {
  CIORNA: "Ciornă",
  DE_SEMNAT: "La pastor, de semnat",
  APROBAT: "Aprobat",
  RESPINS: "Respins de pastor",
};

export const DOCUMENT_TYPES = ["adeverinta", "botez", "binecuvantare", "recomandare", "scrisoare", "raport", "convocare"] as const;
/** The prototype's document types (the parity tests compare these). */
export const PROTOTYPE_DOCUMENT_TYPES = ["adeverinta", "botez", "binecuvantare", "recomandare", "scrisoare", "raport"] as const;
export type DocumentTypeKey = (typeof DOCUMENT_TYPES)[number];
/** DTYPES din prototip. */
export const DOCUMENT_TYPE_LABEL: Record<DocumentTypeKey, string> = {
  adeverinta: "Adeverință de membru",
  botez: "Certificat de botez",
  binecuvantare: "Certificat de binecuvântare a copilului",
  recomandare: "Scrisoare de recomandare (transfer)",
  scrisoare: "Scrisoare / adresă oficială",
  raport: "Dare de seamă anuală",
  convocare: "Convocare Adunare Generală",
};
/** Titlul tipărit pe document (docHtml din prototip). */
export const DOCUMENT_HEADING: Record<DocumentTypeKey, string> = {
  adeverinta: "Adeverință",
  botez: "Certificat de botez",
  binecuvantare: "Certificat de binecuvântare",
  recomandare: "Scrisoare de recomandare",
  scrisoare: "",
  raport: "Dare de seamă anuală",
  convocare: "Convocare",
};

export const ROLES = ["ADMIN", "SECRETAR", "VIZUALIZARE", "RUGACIUNE"] as const;
export type RoleKey = (typeof ROLES)[number];
export const ROLE_LABEL: Record<RoleKey, string> = {
  ADMIN: "Administrator",
  SECRETAR: "Secretar",
  VIZUALIZARE: "Vizualizare",
  RUGACIUNE: "Rugăciune",
};
export const ROLE_DESCRIPTION: Record<RoleKey, string> = {
  ADMIN: "Acces complet: date, setări, utilizatori, import.",
  SECRETAR: "Adaugă și modifică date, emite documente, exportă.",
  VIZUALIZARE: "Doar consultare și tipărire.",
  RUGACIUNE: "Doar familia săptămânii pentru anunțul de rugăciune; fără acces la registru.",
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
    "Cina Domnului",
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

/** Statut art. 27 alin. 3: the forms of a disciplinary measure (administrators only). */
export const DISCIPLINARY_FORMS = ["MUSTRARE_PERSONALA", "MUSTRARE_COMITET", "RETRAGERE_DREPTURI", "SUSPENDARE", "EXCLUDERE"] as const;
export type DisciplinaryFormKey = (typeof DISCIPLINARY_FORMS)[number];
export const DISCIPLINARY_FORM_LABEL: Record<DisciplinaryFormKey, string> = {
  MUSTRARE_PERSONALA: "Mustrare personală",
  MUSTRARE_COMITET: "Mustrare în fața comitetului",
  RETRAGERE_DREPTURI: "Retragerea unor drepturi",
  SUSPENDARE: "Suspendare",
  EXCLUDERE: "Excludere",
};
export const DISCIPLINARY_STATES = ["CERCETARE", "APLICATA", "INCHEIATA"] as const;
export type DisciplinaryStateKey = (typeof DISCIPLINARY_STATES)[number];
export const DISCIPLINARY_STATE_LABEL: Record<DisciplinaryStateKey, string> = {
  CERCETARE: "În cercetare",
  APLICATA: "Aplicată",
  INCHEIATA: "Încheiată",
};
export const DISCIPLINARY_FORUMS = ["LOCAL", "COMUNITATE"] as const;
export type DisciplinaryForumKey = (typeof DISCIPLINARY_FORUMS)[number];
export const DISCIPLINARY_FORUM_LABEL: Record<DisciplinaryForumKey, string> = { LOCAL: "Biserica locală", COMUNITATE: "Comunitatea" };

/** The privacy notice and the four optional consents (privacy notice 1.0, point 3 d). */
export const CONSENT_KINDS = ["INFO_NOTE", "PHOTOS", "BIRTHDAY", "CONTACT", "DIRECTORY"] as const;
export type ConsentKindKey = (typeof CONSENT_KINDS)[number];
export const OPTIONAL_CONSENTS = ["PHOTOS", "BIRTHDAY", "CONTACT", "DIRECTORY"] as const satisfies readonly ConsentKindKey[];
export type OptionalConsentKey = (typeof OPTIONAL_CONSENTS)[number];
/** Short names (person page, exports, totals). */
export const CONSENT_LABEL: Record<ConsentKindKey, string> = {
  INFO_NOTE: "Nota de informare",
  PHOTOS: "Fotografii și filmări",
  BIRTHDAY: "Ziua de naștere anunțată",
  CONTACT: "Anunțuri prin WhatsApp, SMS sau e-mail",
  DIRECTORY: "În lista de contacte a bisericii",
};
/** The questions of the form, as the person reads them. */
export const CONSENT_QUESTION: Record<OptionalConsentKey, string> = {
  PHOTOS: "Fotografii și filmări în care apar în mod individualizat (de exemplu în prim-plan, la botez, în postări pe site sau rețele sociale) pot fi publicate",
  BIRTHDAY: "Ziua mea de naștere poate fi anunțată în biserică",
  CONTACT: "Pot fi contactat(ă) pentru anunțuri prin WhatsApp, SMS sau e-mail",
  DIRECTORY: "Telefonul și adresa mea pot apărea în lista de contacte a bisericii, vizibilă membrilor",
};
/** The same questions about a minor child, answered by the parent. */
export const CONSENT_QUESTION_CHILD: Record<OptionalConsentKey, string> = {
  PHOTOS: "Fotografii și filmări în care apare copilul în mod individualizat pot fi publicate",
  BIRTHDAY: "Ziua de naștere a copilului poate fi anunțată în biserică",
  CONTACT: "Copilul poate fi contactat pentru anunțuri prin WhatsApp, SMS sau e-mail",
  DIRECTORY: "Datele de contact ale copilului pot apărea în lista de contacte a bisericii",
};
export const CONSENT_SOURCE_LABEL = { ONLINE: "online", PAPER: "pe hârtie", STAFF: "consemnat de secretariat" } as const;
