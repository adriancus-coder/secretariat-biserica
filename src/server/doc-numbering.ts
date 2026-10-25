import type { Prisma } from "@/generated/prisma/client";

type NumberingTx = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Prisma.PrismaPromise<number>;
  document: {
    aggregate: (args: { where: Prisma.DocumentWhereInput; _max: { nr: true } }) => Promise<{ _max: { nr: number | null } }>;
  };
};

/**
 * Blochează registrul (biserică, an) până la finalul tranzacției curente, astfel încât alocările
 * simultane să fie serializate, apoi întoarce următorul număr liber. Trebuie apelată într-o
 * tranzacție interactivă, înainte de crearea documentului.
 */
export async function lockDocumentRegister(tx: NumberingTx, churchId: string, year: number): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`doc-nr:${churchId}:${year}`}))`;
}

export async function nextFreeNumber(tx: NumberingTx, churchId: string, year: number): Promise<number> {
  const agg = await tx.document.aggregate({ where: { churchId, anRegistru: year }, _max: { nr: true } });
  return (agg._max.nr ?? 0) + 1;
}

type MeetingNumberingTx = {
  $executeRaw: NumberingTx["$executeRaw"];
  meeting: {
    aggregate: (args: { where: Prisma.MeetingWhereInput; _max: { nr: true } }) => Promise<{ _max: { nr: number | null } }>;
  };
};

/** The minutes register works like the document register: one lock and one numbering per (church, year). */
export async function lockMeetingRegister(tx: MeetingNumberingTx, churchId: string, year: number): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pv-nr:${churchId}:${year}`}))`;
}

export async function nextFreeMeetingNumber(tx: MeetingNumberingTx, churchId: string, year: number): Promise<number> {
  const agg = await tx.meeting.aggregate({ where: { churchId, anRegistru: year }, _max: { nr: true } });
  return (agg._max.nr ?? 0) + 1;
}
