/**
 * Copia de siguranță în formatul JSON al prototipului:
 *
 *   { members: {id: {...}}, meetings: {...}, events: {...}, documents: {...},
 *     groups: {...}, notes: {...}, settings: {...} }
 *
 * - valorile fixe (statut, mod de intrare/ieșire) sunt etichetele românești din prototip;
 * - datele sunt șiruri „AAAA-LL-ZZ”, valorile lipsă sunt șiruri goale;
 * - referințele (prezenti, membri, persoanaId, membruId) sunt id-uri de persoane.
 *
 * Fișierele exportate de aplicație pot fi importate în prototip și invers.
 */
import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import {
  DOCUMENT_TYPES,
  ENTRY_LABEL,
  EXIT_LABEL,
  keyForLabel,
  STATUS_LABEL,
  type DocumentTypeKey,
  type EntryModeKey,
  type ExitModeKey,
  type GenderKey,
  type PersonStatusKey,
} from "@/lib/labels";

export const BACKUP_COLLECTIONS = ["members", "meetings", "events", "documents", "groups", "notes"] as const;

// ---------------------------------------------------------------------------
// Modelul intern (independent de Prisma), folosit la export și rezultat la import
// ---------------------------------------------------------------------------

export interface BPerson {
  id: string;
  nume: string;
  prenume: string;
  statut: PersonStatusKey;
  gen: GenderKey | null;
  familie: string;
  rudenie: string;
  dataNasterii: string | null;
  telefon: string;
  email: string;
  adresa: string;
  dataMembru: string | null;
  modIntrare: EntryModeKey | null;
  bisericaProvenienta: string;
  dataBotez: string | null;
  locBotez: string;
  dataBinecuvantare: string | null;
  dataIesire: string | null;
  modIesire: ExitModeKey | null;
  bisericaDestinatie: string;
  slujire: string;
  note: string;
  createdAt: string | null;
}

export interface BMeeting {
  id: string;
  titlu: string;
  tip: string;
  data: string;
  ora: string;
  loc: string;
  presedinte: string;
  prezenti: string[];
  invitati: string;
  ordine: string;
  discutii: string;
  hotarari: string;
  createdAt: string | null;
}

export interface BEvent {
  id: string;
  titlu: string;
  tip: string;
  data: string;
  ora: string;
  loc: string;
  invitat: string;
  responsabil: string;
  descriere: string;
  agapa: { activ: boolean; responsabil: string; persoane: number | null; contributii: { cine: string; ce: string }[] };
  createdAt: string | null;
}

export interface BDocument {
  id: string;
  tip: DocumentTypeKey;
  nr: number;
  data: string;
  membruId: string | null;
  persoana: string;
  catre: string;
  scop: string;
  titlu: string;
  text: string;
  an: number | null;
  createdAt: string | null;
}

export interface BGroup {
  id: string;
  nume: string;
  responsabil: string;
  descriere: string;
  membri: string[];
  createdAt: string | null;
}

export interface BNote {
  id: string;
  data: string;
  tip: string;
  persoanaId: string | null;
  familie: string;
  text: string;
  createdAt: string | null;
}

export interface BSettings {
  nume: string;
  adresa: string;
  orgnr: string;
  telefon: string;
  email: string;
  pastor: string;
  secretar: string;
  nomen: { tipuriSedinte: string[]; tipuriEvenimente: string[]; tipuriMentiuni: string[]; rudenie: string[] };
}

export interface Backup {
  members: BPerson[];
  meetings: BMeeting[];
  events: BEvent[];
  documents: BDocument[];
  groups: BGroup[];
  notes: BNote[];
  settings: BSettings | null;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const d = (v: string | null) => v ?? "";

/** Construiește obiectul JSON în formatul prototipului. */
export function toPrototypeJson(b: Backup): Record<string, unknown> {
  const byId = <T extends { id: string }>(list: T[], map: (x: T) => Record<string, unknown>) =>
    Object.fromEntries(list.map((x) => [x.id, { ...map(x), id: x.id }]));
  return {
    members: byId(b.members, (p) => ({
      nume: p.nume,
      prenume: p.prenume,
      statut: STATUS_LABEL[p.statut],
      familie: p.familie,
      rudenie: p.rudenie,
      dataNasterii: d(p.dataNasterii),
      gen: p.gen ?? "",
      telefon: p.telefon,
      email: p.email,
      adresa: p.adresa,
      dataMembru: d(p.dataMembru),
      modIntrare: p.modIntrare ? ENTRY_LABEL[p.modIntrare] : "",
      bisericaProvenienta: p.bisericaProvenienta,
      dataBotez: d(p.dataBotez),
      locBotez: p.locBotez,
      dataBinecuvantare: d(p.dataBinecuvantare),
      dataIesire: d(p.dataIesire),
      modIesire: p.modIesire ? EXIT_LABEL[p.modIesire] : "",
      bisericaDestinatie: p.bisericaDestinatie,
      slujire: p.slujire,
      note: p.note,
      createdAt: d(p.createdAt),
    })),
    meetings: byId(b.meetings, (m) => ({
      titlu: m.titlu,
      tip: m.tip,
      data: m.data,
      ora: m.ora,
      loc: m.loc,
      presedinte: m.presedinte,
      prezenti: m.prezenti,
      invitati: m.invitati,
      ordine: m.ordine,
      discutii: m.discutii,
      hotarari: m.hotarari,
      createdAt: d(m.createdAt),
    })),
    events: byId(b.events, (e) => ({
      titlu: e.titlu,
      tip: e.tip,
      data: e.data,
      ora: e.ora,
      loc: e.loc,
      invitat: e.invitat,
      responsabil: e.responsabil,
      descriere: e.descriere,
      agapa: {
        activ: e.agapa.activ,
        responsabil: e.agapa.responsabil,
        persoane: e.agapa.persoane === null ? "" : String(e.agapa.persoane),
        contributii: e.agapa.contributii,
      },
      createdAt: d(e.createdAt),
    })),
    documents: byId(b.documents, (x) => ({
      tip: x.tip,
      nr: x.nr,
      data: x.data,
      membruId: x.membruId ?? "",
      persoana: x.persoana,
      catre: x.catre,
      scop: x.scop,
      titlu: x.titlu,
      text: x.text,
      an: x.an ?? "",
      createdAt: d(x.createdAt),
    })),
    groups: byId(b.groups, (g) => ({
      nume: g.nume,
      responsabil: g.responsabil,
      descriere: g.descriere,
      membri: g.membri,
      createdAt: d(g.createdAt),
    })),
    notes: byId(b.notes, (n) => ({
      data: n.data,
      tip: n.tip,
      persoanaId: n.persoanaId ?? "",
      familie: n.familie,
      text: n.text,
      createdAt: d(n.createdAt),
    })),
    settings: b.settings ?? {},
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Orice valoare scalară → șir fără spații la capete (null/undefined → ""). */
const str = z.unknown().transform((v) => (v === null || v === undefined ? "" : typeof v === "object" ? "" : String(v).trim()));
const longStr = z.unknown().transform((v) => (v === null || v === undefined || typeof v === "object" ? "" : String(v).replace(/\r\n/g, "\n")));
const strList = z.unknown().transform((v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" || typeof x === "number").map(String) : []));

export interface ImportResult {
  ok: boolean;
  backup: Backup;
  errors: string[];
  warnings: string[];
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function collection(raw: Record<string, unknown>, key: string): [string, Record<string, unknown>][] {
  const c = raw[key];
  if (c === undefined || c === null) return [];
  const entries: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  return entries.filter((e): e is [string, Record<string, unknown>] => typeof e[1] === "object" && e[1] !== null);
}

/**
 * Validează și convertește un fișier JSON în formatul prototipului (sau exportat de aplicație).
 * Erorile blochează importul; avertismentele descriu corecțiile automate.
 */
export function parsePrototypeJson(raw: unknown): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const backup: Backup = { members: [], meetings: [], events: [], documents: [], groups: [], notes: [], settings: null };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, backup, errors: ["Fișierul nu conține un obiect JSON valid."], warnings };
  }
  const root = raw as Record<string, unknown>;
  const known = [...BACKUP_COLLECTIONS, "settings"];
  if (!known.some((k) => k in root)) {
    return { ok: false, backup, errors: ["Fișierul nu pare a fi o copie de siguranță a secretariatului."], warnings };
  }

  const err = (msg: string) => {
    if (errors.length < 50) errors.push(msg);
  };
  const ident = (key: string, obj: Record<string, unknown>, what: string): string | null => {
    const id = String(obj.id ?? key).trim();
    if (!ID_RE.test(id)) {
      err(`${what}: identificator invalid „${id.slice(0, 40)}”.`);
      return null;
    }
    return id;
  };
  const date = (v: unknown, what: string, field: string, required = false): string | null => {
    const s = str.parse(v);
    if (!s) {
      if (required) err(`${what}: lipsește ${field}.`);
      return null;
    }
    if (!isIsoDate(s)) {
      err(`${what}: ${field} „${s}” nu este o dată validă (AAAA-LL-ZZ).`);
      return null;
    }
    return s;
  };

  // Persoane
  const seen = new Set<string>();
  for (const [key, m] of collection(root, "members")) {
    const id = ident(key, m, "Persoană");
    if (!id) continue;
    const nume = str.parse(m.nume);
    const who = `Persoana ${nume || id}`;
    if (!nume) err(`${who}: numele lipsește.`);
    const statutRaw = str.parse(m.statut);
    const statut = statutRaw ? keyForLabel(STATUS_LABEL, statutRaw) : "MEMBRU";
    if (!statut) err(`${who}: statut necunoscut „${statutRaw}”.`);
    const gRaw = str.parse(m.gen).toUpperCase();
    const gen = gRaw === "M" || gRaw === "F" ? gRaw : null;
    if (gRaw && !gen) warnings.push(`${who}: genul „${gRaw}” a fost ignorat.`);
    const miRaw = str.parse(m.modIntrare);
    let modIntrare = miRaw ? (keyForLabel(ENTRY_LABEL, miRaw) ?? null) : null;
    if (miRaw && !modIntrare) {
      modIntrare = "ALTUL";
      warnings.push(`${who}: modul de intrare „${miRaw}” a fost înregistrat ca „Altul”.`);
    }
    const mieRaw = str.parse(m.modIesire);
    let modIesire = mieRaw ? (keyForLabel(EXIT_LABEL, mieRaw) ?? null) : null;
    if (mieRaw && !modIesire) {
      modIesire = "ALTUL";
      warnings.push(`${who}: modul de ieșire „${mieRaw}” a fost înregistrat ca „Altul”.`);
    }
    seen.add(id);
    backup.members.push({
      id,
      nume,
      prenume: str.parse(m.prenume),
      statut: statut ?? "MEMBRU",
      gen,
      familie: str.parse(m.familie),
      rudenie: str.parse(m.rudenie),
      dataNasterii: date(m.dataNasterii, who, "data nașterii"),
      telefon: str.parse(m.telefon),
      email: str.parse(m.email),
      adresa: str.parse(m.adresa),
      dataMembru: date(m.dataMembru, who, "data intrării"),
      modIntrare,
      bisericaProvenienta: str.parse(m.bisericaProvenienta),
      dataBotez: date(m.dataBotez, who, "data botezului"),
      locBotez: str.parse(m.locBotez),
      dataBinecuvantare: date(m.dataBinecuvantare, who, "data binecuvântării"),
      dataIesire: date(m.dataIesire, who, "data ieșirii"),
      modIesire,
      bisericaDestinatie: str.parse(m.bisericaDestinatie),
      slujire: str.parse(m.slujire),
      note: longStr.parse(m.note).trim(),
      createdAt: date(m.createdAt, who, "data înregistrării"),
    });
  }
  const personRef = (v: unknown, what: string): string | null => {
    const id = str.parse(v);
    if (!id) return null;
    if (!seen.has(id)) {
      warnings.push(`${what}: persoana „${id}” nu există în fișier și a fost ignorată.`);
      return null;
    }
    return id;
  };
  const personRefs = (v: unknown, what: string) =>
    [...new Set(strList.parse(v))].map((id) => personRef(id, what)).filter((x): x is string => x !== null);

  for (const [key, m] of collection(root, "meetings")) {
    const id = ident(key, m, "Proces-verbal");
    if (!id) continue;
    const titlu = str.parse(m.titlu);
    const tip = str.parse(m.tip) || "Altele";
    const what = `Procesul-verbal ${titlu || tip}`;
    const data = date(m.data, what, "data", true);
    backup.meetings.push({
      id,
      titlu,
      tip,
      data: data ?? "",
      ora: str.parse(m.ora),
      loc: str.parse(m.loc),
      presedinte: str.parse(m.presedinte),
      prezenti: personRefs(m.prezenti, what),
      invitati: str.parse(m.invitati),
      ordine: longStr.parse(m.ordine).trim(),
      discutii: longStr.parse(m.discutii).trim(),
      hotarari: longStr.parse(m.hotarari).trim(),
      createdAt: date(m.createdAt, what, "data înregistrării"),
    });
  }

  for (const [key, e] of collection(root, "events")) {
    const id = ident(key, e, "Eveniment");
    if (!id) continue;
    const titlu = str.parse(e.titlu);
    const what = `Evenimentul ${titlu || id}`;
    if (!titlu) err(`${what}: titlul lipsește.`);
    const data = date(e.data, what, "data", true);
    const ag = typeof e.agapa === "object" && e.agapa !== null ? (e.agapa as Record<string, unknown>) : {};
    const persRaw = str.parse(ag.persoane);
    const persoane = persRaw && /^\d+$/.test(persRaw) ? Number(persRaw) : null;
    if (persRaw && persoane === null) warnings.push(`${what}: numărul de persoane „${persRaw}” a fost ignorat.`);
    const contributii = Array.isArray(ag.contributii)
      ? ag.contributii
          .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
          .map((c) => ({ cine: str.parse(c.cine), ce: str.parse(c.ce) }))
          .filter((c) => c.cine || c.ce)
      : [];
    backup.events.push({
      id,
      titlu,
      tip: str.parse(e.tip) || "Altele",
      data: data ?? "",
      ora: str.parse(e.ora),
      loc: str.parse(e.loc),
      invitat: str.parse(e.invitat),
      responsabil: str.parse(e.responsabil),
      descriere: longStr.parse(e.descriere).trim(),
      agapa: { activ: ag.activ === true || ag.activ === "true", responsabil: str.parse(ag.responsabil), persoane, contributii },
      createdAt: date(e.createdAt, what, "data înregistrării"),
    });
  }

  for (const [key, x] of collection(root, "documents")) {
    const id = ident(key, x, "Document");
    if (!id) continue;
    const tipRaw = str.parse(x.tip);
    const what = `Documentul ${str.parse(x.titlu) || id}`;
    const tip = (DOCUMENT_TYPES as readonly string[]).includes(tipRaw) ? (tipRaw as DocumentTypeKey) : null;
    if (!tip) err(`${what}: tip de document necunoscut „${tipRaw}”.`);
    const text = longStr.parse(x.text).trim();
    if (!text) err(`${what}: conținutul lipsește.`);
    const nrRaw = Number(str.parse(x.nr));
    const anRaw = str.parse(x.an);
    backup.documents.push({
      id,
      tip: tip ?? "scrisoare",
      nr: Number.isInteger(nrRaw) && nrRaw > 0 ? nrRaw : 0,
      data: date(x.data, what, "data", true) ?? "",
      membruId: personRef(x.membruId, what),
      persoana: str.parse(x.persoana),
      catre: str.parse(x.catre),
      scop: str.parse(x.scop),
      titlu: str.parse(x.titlu),
      text,
      an: /^\d{4}$/.test(anRaw) ? Number(anRaw) : null,
      createdAt: date(x.createdAt, what, "data înregistrării"),
    });
  }

  for (const [key, g] of collection(root, "groups")) {
    const id = ident(key, g, "Grup");
    if (!id) continue;
    const nume = str.parse(g.nume);
    const what = `Grupul ${nume || id}`;
    if (!nume) err(`${what}: numele lipsește.`);
    backup.groups.push({
      id,
      nume,
      responsabil: str.parse(g.responsabil),
      descriere: longStr.parse(g.descriere).trim(),
      membri: personRefs(g.membri, what),
      createdAt: date(g.createdAt, what, "data înregistrării"),
    });
  }

  for (const [key, n] of collection(root, "notes")) {
    const id = ident(key, n, "Mențiune");
    if (!id) continue;
    const what = `Mențiunea ${id}`;
    const text = longStr.parse(n.text).trim();
    if (!text) err(`${what}: textul lipsește.`);
    const createdAt = date(n.createdAt, what, "data înregistrării");
    let data = date(n.data, what, "data");
    if (!data) {
      data = createdAt;
      if (!data) err(`${what}: lipsește data.`);
      else warnings.push(`${what}: fără dată — s-a folosit data înregistrării.`);
    }
    backup.notes.push({
      id,
      data: data ?? "",
      tip: str.parse(n.tip) || "Generală",
      persoanaId: personRef(n.persoanaId, what),
      familie: str.parse(n.familie),
      text,
      createdAt,
    });
  }

  const s = root.settings;
  if (typeof s === "object" && s !== null && Object.keys(s).length) {
    const st = s as Record<string, unknown>;
    const nomen = typeof st.nomen === "object" && st.nomen !== null ? (st.nomen as Record<string, unknown>) : {};
    const lines = (v: unknown) => [...new Set(strList.parse(v).map((x) => x.trim()).filter(Boolean))];
    backup.settings = {
      nume: str.parse(st.nume),
      adresa: str.parse(st.adresa),
      orgnr: str.parse(st.orgnr ?? st.orgNr),
      telefon: str.parse(st.telefon),
      email: str.parse(st.email),
      pastor: str.parse(st.pastor),
      secretar: str.parse(st.secretar),
      nomen: {
        tipuriSedinte: lines(nomen.tipuriSedinte),
        tipuriEvenimente: lines(nomen.tipuriEvenimente),
        tipuriMentiuni: lines(nomen.tipuriMentiuni),
        rudenie: lines(nomen.rudenie),
      },
    };
  }

  return { ok: errors.length === 0, backup, errors, warnings };
}

/**
 * Numere de înregistrare valide și unice pe an: documentele fără număr sau cu număr duplicat
 * primesc următorul număr liber din anul lor (păstrând ordinea din fișier).
 */
export function normalizeDocumentNumbers(
  docs: BDocument[],
  taken: Map<number, Set<number>> = new Map(),
): { docs: BDocument[]; renumbered: string[] } {
  const used = new Map<number, Set<number>>([...taken].map(([y, s]) => [y, new Set(s)]));
  const renumbered: string[] = [];
  const out = docs.map((x) => ({ ...x }));
  const yearOf = (x: BDocument) => Number(x.data.slice(0, 4));
  // Mai întâi păstrăm numerele valide, la prima apariție.
  const keep = new Set<BDocument>();
  for (const x of out) {
    const set = used.get(yearOf(x)) ?? new Set<number>();
    used.set(yearOf(x), set);
    if (x.nr > 0 && !set.has(x.nr)) {
      set.add(x.nr);
      keep.add(x);
    }
  }
  for (const x of out) {
    if (keep.has(x)) continue;
    const set = used.get(yearOf(x))!;
    let nr = 1;
    while (set.has(nr)) nr++;
    renumbered.push(`${x.titlu || x.tip} (nr. ${x.nr || "—"} → ${nr}/${yearOf(x)})`);
    x.nr = nr;
    set.add(nr);
  }
  return { docs: out, renumbered };
}
