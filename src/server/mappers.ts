import "server-only";
import type { DocPerson } from "@/domain/documents";
import type { EventRecord, PersonRecord } from "@/domain/types";
import { fromDbDate } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";

/** Câmpurile persoanei necesare statisticilor, dării de seamă și șabloanelor de documente. */
export const personRecordSelect = {
  id: true,
  nume: true,
  prenume: true,
  statut: true,
  gen: true,
  familyId: true,
  rudenie: true,
  dataNasterii: true,
  dataMembru: true,
  modIntrare: true,
  bisericaProvenienta: true,
  dataBotez: true,
  botezAn: true,
  botezBiserica: true,
  botezLocalitate: true,
  botezOficiant: true,
  dataBinecuvantare: true,
  dataIesire: true,
  modIesire: true,
  bisericaDestinatie: true,
  createdAt: true,
  plecatDin: true,
  numeTata: true,
  numeMama: true,
} satisfies Prisma.PersonSelect;

export type PersonRecordRow = Prisma.PersonGetPayload<{ select: typeof personRecordSelect }>;

export function toPersonRecord(p: PersonRecordRow): PersonRecord {
  return {
    id: p.id,
    nume: p.nume,
    prenume: p.prenume,
    statut: p.statut,
    gen: p.gen,
    familyId: p.familyId,
    rudenie: p.rudenie,
    dataNasterii: fromDbDate(p.dataNasterii),
    dataMembru: fromDbDate(p.dataMembru),
    modIntrare: p.modIntrare,
    bisericaProvenienta: p.bisericaProvenienta,
    dataBotez: fromDbDate(p.dataBotez),
    botezAn: p.botezAn,
    // The domain keeps the prototype's single "locBotez"; the locality is what it held.
    locBotez: p.botezLocalitate,
    botezBiserica: p.botezBiserica,
    botezOficiant: p.botezOficiant,
    dataBinecuvantare: fromDbDate(p.dataBinecuvantare),
    dataIesire: fromDbDate(p.dataIesire),
    modIesire: p.modIesire,
    bisericaDestinatie: p.bisericaDestinatie,
    createdAt: p.createdAt.toISOString().slice(0, 10),
    plecatDin: fromDbDate(p.plecatDin),
  };
}

export function toDocPerson(p: PersonRecord, parents?: { numeTata: string; numeMama: string }): DocPerson {
  return {
    id: p.id,
    nume: p.nume,
    prenume: p.prenume,
    gen: p.gen,
    familyId: p.familyId,
    rudenie: p.rudenie,
    dataNasterii: p.dataNasterii,
    dataMembru: p.dataMembru,
    dataBotez: p.dataBotez,
    botezAn: p.botezAn,
    locBotez: p.locBotez,
    botezBiserica: p.botezBiserica,
    botezOficiant: p.botezOficiant,
    dataBinecuvantare: p.dataBinecuvantare,
    // Only the parents' names: callers may pass the whole database row (its dates are Date objects).
    ...(parents ? { numeTata: parents.numeTata, numeMama: parents.numeMama } : {}),
  };
}

export function toEventRecord(e: { id: string; titlu: string; tip: string; data: Date }): EventRecord {
  return { id: e.id, titlu: e.titlu, tip: e.tip, data: fromDbDate(e.data)! };
}
