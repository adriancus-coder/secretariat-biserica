import { categoryDef, type CombineMode } from "@/domain/categories";
import { unmarriedLabel } from "./marital";
import { ageAt } from "./dates";
import { fmtDot } from "@/domain/print";
import { formatAddress } from "./address";
import { ENTRY_LABEL, GENDER_LABEL, STATUS_LABEL, type ConsentKindKey, type EntryModeKey, type GenderKey, type PersonStatusKey } from "./labels";
import { CONSENT_STATE_LABEL, type ConsentState } from "./consents";

/** Exporting a list of persons (Excel, CSV, PDF): the columns, the rows and the file name. Pure. */

export interface ExportPerson {
  id: string;
  nume: string;
  prenume: string;
  gen: GenderKey | null;
  dataNasterii: string | null;
  statut: PersonStatusKey;
  familie: string;
  familyId: string | null;
  rudenie: string;
  telefon: string;
  email: string;
  adresa: string;
  codPostal: string;
  localitate: string;
  dataMembru: string | null;
  modIntrare: EntryModeKey | null;
  dataBotez: string | null;
  botezAn: number | null;
  botezBiserica: string;
  dataCasatoriei: string | null;
  necasatorit: boolean;
  functii: string;
  inComitet: boolean;
  grupuri: string;
  /** Current consents (absent = Neexprimat). */
  acorduri?: Partial<Record<ConsentKindKey, ConsentState>>;
}

export const EXPORT_COLUMNS = [
  ["nume", "Nume"],
  ["prenume", "Prenume"],
  ["gen", "Gen"],
  ["dataNasterii", "Data nașterii"],
  ["varsta", "Vârsta"],
  ["statut", "Statut"],
  ["familie", "Familie"],
  ["rudenie", "Grad de rudenie"],
  ["telefon", "Telefon"],
  ["email", "E-mail"],
  ["adresa", "Adresă"],
  ["codPostal", "Cod poștal"],
  ["localitate", "Localitate"],
  ["adresaCompleta", "Adresa completă"],
  ["dataMembru", "Data intrării"],
  ["modIntrare", "Mod intrare"],
  ["botez", "Data botezului / anul"],
  ["botezBiserica", "Biserica botezului"],
  ["dataCasatoriei", "Data căsătoriei"],
  ["functii", "Funcții și slujiri"],
  ["comitet", "Comitet"],
  ["grupuri", "Grupuri"],
  ["acord_INFO_NOTE", "Nota de informare"],
  ["acord_PHOTOS", "Acord: fotografii"],
  ["acord_BIRTHDAY", "Acord: ziua de naștere"],
  ["acord_CONTACT", "Acord: anunțuri"],
  ["acord_DIRECTORY", "Acord: lista de contacte"],
] as const;
export type ExportColumn = (typeof EXPORT_COLUMNS)[number][0];
export const EXPORT_COLUMN_KEYS = EXPORT_COLUMNS.map(([k]) => k) as ExportColumn[];
export const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = ["nume", "prenume", "dataNasterii", "varsta", "statut", "familie", "telefon"];

export const EXPORT_SORTS = ["alfabetic", "familii", "varsta"] as const;
export type ExportSort = (typeof EXPORT_SORTS)[number];
export const EXPORT_SORT_LABEL: Record<ExportSort, string> = { alfabetic: "Alfabetic", familii: "Pe familii", varsta: "După vârstă" };
export const EXPORT_FORMATS = ["xlsx", "csv", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const COMBINE_LABEL: Record<CombineMode, string> = { oricare: "oricare", toate: "toate" };

export const columnLabel = (c: ExportColumn) => EXPORT_COLUMNS.find(([k]) => k === c)![1];

/** One cell as text (dates as dd.mm.yyyy, the age at the reference date). */
export function cell(p: ExportPerson, c: ExportColumn, refDate: string): string {
  switch (c) {
    case "nume":
      return p.nume;
    case "prenume":
      return p.prenume;
    case "gen":
      return p.gen ? GENDER_LABEL[p.gen] : "";
    case "dataNasterii":
      return p.dataNasterii ? fmtDot(p.dataNasterii) : "";
    case "varsta":
      return p.dataNasterii ? String(ageAt(p.dataNasterii, refDate)) : "";
    case "statut":
      return STATUS_LABEL[p.statut];
    case "familie":
      return p.familie;
    case "rudenie":
      return p.rudenie;
    case "telefon":
      return p.telefon;
    case "email":
      return p.email;
    case "adresa":
      return p.adresa;
    case "codPostal":
      return p.codPostal;
    case "localitate":
      return p.localitate;
    case "adresaCompleta":
      return formatAddress(p);
    case "dataMembru":
      return p.dataMembru ? fmtDot(p.dataMembru) : "";
    case "modIntrare":
      return p.modIntrare ? ENTRY_LABEL[p.modIntrare] : "";
    case "botez":
      return p.dataBotez ? fmtDot(p.dataBotez) : p.botezAn ? String(p.botezAn) : "";
    case "botezBiserica":
      return p.botezBiserica;
    case "dataCasatoriei":
      return p.dataCasatoriei ? fmtDot(p.dataCasatoriei) : p.necasatorit ? unmarriedLabel(p.gen) : "";
    case "functii":
      return p.functii;
    case "comitet":
      return p.inComitet ? "da" : "";
    case "grupuri":
      return p.grupuri;
    case "acord_INFO_NOTE":
    case "acord_PHOTOS":
    case "acord_BIRTHDAY":
    case "acord_CONTACT":
    case "acord_DIRECTORY": {
      const st = p.acorduri?.[c.slice(6) as ConsentKindKey] ?? "NEEXPRIMAT";
      return c === "acord_INFO_NOTE" ? (st === "DA" ? "confirmată" : "neconfirmată") : CONSENT_STATE_LABEL[st];
    }
  }
}

/** The persons in the chosen order: alphabetical (as given), by family (then kinship rank), or by age (oldest first, unknown last). */
export function sortForExport(persons: ExportPerson[], sort: ExportSort, rank: (rudenie: string) => number): ExportPerson[] {
  if (sort === "alfabetic") return persons;
  if (sort === "varsta") {
    return [...persons].sort((a, b) => (a.dataNasterii ?? "9999").localeCompare(b.dataNasterii ?? "9999"));
  }
  const firstIndex = new Map<string, number>();
  persons.forEach((p, i) => {
    const k = p.familyId ?? `solo:${p.id}`;
    if (!firstIndex.has(k)) firstIndex.set(k, p.familie ? i : persons.length + i);
  });
  const famKey = (p: ExportPerson) => p.familyId ?? `solo:${p.id}`;
  return [...persons].sort((a, b) => firstIndex.get(famKey(a))! - firstIndex.get(famKey(b))! || rank(a.rudenie) - rank(b.rudenie));
}

export function exportRows(persons: ExportPerson[], columns: ExportColumn[], refDate: string): string[][] {
  return persons.map((p) => columns.map((c) => cell(p, c, refDate)));
}

/** CSV for Excel in Norway / Romania: UTF-8 with BOM, ";" separator, CRLF, quoted when needed. */
export function toCsv(header: string[], rows: string[][]): string {
  const q = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `﻿${[header, ...rows].map((r) => r.map(q).join(";")).join("\r\n")}\r\n`;
}

/** "persoane-copii-minori-copii-apartinatori-2026-10-25.xlsx". */
export function exportFileName(keys: string[], date: string, format: ExportFormat): string {
  const slug = keys.join("-").replace(/[^a-z0-9-]/g, "").slice(0, 80) || "lista";
  return `persoane-${slug}-${date}.${format}`;
}

/** "Copii minori + Copii ai aparținătorilor (oricare)" — the title line and the audit entry. */
export function selectionTitle(keys: string[], mode: CombineMode): string {
  const labels = keys.map((k) => categoryDef(k)?.label ?? k);
  return labels.length > 1 ? `${labels.join(mode === "toate" ? " ∧ " : " + ")} (${COMBINE_LABEL[mode]})` : (labels[0] ?? "");
}
