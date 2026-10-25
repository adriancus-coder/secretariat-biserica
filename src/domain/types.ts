import type { EntryModeKey, ExitModeKey, GenderKey, PersonStatusKey } from "@/lib/labels";

/**
 * Obiectele de domeniu folosite de logica pură (statistici, dare de seamă, documente).
 * Datele calendaristice sunt șiruri ISO „AAAA-LL-ZZ” (sau null), exact ca în prototip.
 */
export interface PersonRecord {
  id: string;
  nume: string;
  prenume: string;
  statut: PersonStatusKey;
  gen: GenderKey | null;
  /** The family record (null: no family). The prototype grouped families by a free-text name. */
  familyId: string | null;
  rudenie: string;
  dataNasterii: string | null;
  dataMembru: string | null;
  modIntrare: EntryModeKey | null;
  bisericaProvenienta: string;
  dataBotez: string | null;
  locBotez: string;
  dataBinecuvantare: string | null;
  dataIesire: string | null;
  modIesire: ExitModeKey | null;
  bisericaDestinatie: string;
  /** Data înregistrării în aplicație (AAAA-LL-ZZ). */
  createdAt: string | null;
}

export interface EventRecord {
  id: string;
  titlu: string;
  tip: string;
  data: string;
}

export interface ChurchInfo {
  nume: string;
  adresa: string;
  orgNr: string;
  telefon: string;
  email: string;
  pastor: string;
  secretar: string;
}
