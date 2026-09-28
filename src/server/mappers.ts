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
  familie: true,
  rudenie: true,
  dataNasterii: true,
  dataMembru: true,
  modIntrare: true,
  bisericaProvenienta: true,
  dataBotez: true,
  locBotez: true,
  dataBinecuvantare: true,
  dataIesire: true,
  modIesire: true,
  bisericaDestinatie: true,
  createdAt: true,
} satisfies Prisma.PersonSelect;

export type PersonRecordRow = Prisma.PersonGetPayload<{ select: typeof personRecordSelect }>;

export function toPersonRecord(p: PersonRecordRow): PersonRecord {
  return {
    id: p.id,
    nume: p.nume,
    prenume: p.prenume,
    statut: p.statut,
    gen: p.gen,
    familie: p.familie,
    rudenie: p.rudenie,
    dataNasterii: fromDbDate(p.dataNasterii),
    dataMembru: fromDbDate(p.dataMembru),
    modIntrare: p.modIntrare,
    bisericaProvenienta: p.bisericaProvenienta,
    dataBotez: fromDbDate(p.dataBotez),
    locBotez: p.locBotez,
    dataBinecuvantare: fromDbDate(p.dataBinecuvantare),
    dataIesire: fromDbDate(p.dataIesire),
    modIesire: p.modIesire,
    bisericaDestinatie: p.bisericaDestinatie,
    createdAt: p.createdAt.toISOString().slice(0, 10),
  };
}

export function toDocPerson(p: PersonRecord): DocPerson {
  return {
    id: p.id,
    nume: p.nume,
    prenume: p.prenume,
    gen: p.gen,
    familie: p.familie,
    rudenie: p.rudenie,
    dataNasterii: p.dataNasterii,
    dataMembru: p.dataMembru,
    dataBotez: p.dataBotez,
    locBotez: p.locBotez,
    dataBinecuvantare: p.dataBinecuvantare,
  };
}

export function toEventRecord(e: { id: string; titlu: string; tip: string; data: Date }): EventRecord {
  return { id: e.id, titlu: e.titlu, tip: e.tip, data: fromDbDate(e.data)! };
}
