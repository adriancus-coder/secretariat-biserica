import "server-only";
import { defaultDocumentTitle, generateDocumentText } from "@/domain/documents";
import { fromDbDate } from "@/lib/dates";
import type { DocumentTypeKey } from "@/lib/labels";
import type { DraftInput } from "@/lib/schemas/document";
import { personRecordSelect, toDocPerson, toPersonRecord } from "../mappers";
import type { Ctx } from "../session";
import { getChurch } from "./church";
import { generateReportText } from "./stats";

export const DOCUMENTS_PAGE_SIZE = 30;

export async function listDocuments(ctx: Ctx, { page, year }: { page: number; year: number | null }) {
  const where = year ? { anRegistru: year } : {};
  const [total, years] = await Promise.all([
    ctx.db.document.count({ where }),
    ctx.db.document.groupBy({ by: ["anRegistru"], _count: { _all: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await ctx.db.document.findMany({
    where,
    orderBy: [{ data: "desc" }, { nr: "desc" }],
    skip: (current - 1) * DOCUMENTS_PAGE_SIZE,
    take: DOCUMENTS_PAGE_SIZE,
    select: { id: true, tip: true, nr: true, anRegistru: true, data: true, titlu: true, persoana: true, catre: true },
  });
  return {
    items: rows.map((d) => ({ ...d, data: fromDbDate(d.data)! })),
    total,
    page: current,
    pages,
    years: years.map((y) => y.anRegistru).sort((a, b) => b - a),
  };
}

export async function getDocument(ctx: Ctx, id: string) {
  const d = await ctx.db.document.findUnique({ where: { id } });
  if (!d) return null;
  return { ...d, data: fromDbDate(d.data)! };
}

/** Următorul număr liber în registrul anului dat (informativ; alocarea finală se face la salvare). */
export async function nextDocumentNumber(ctx: Ctx, year: number): Promise<number> {
  const agg = await ctx.db.document.aggregate({ where: { anRegistru: year }, _max: { nr: true } });
  return (agg._max.nr ?? 0) + 1;
}

/**
 * Ciorna unui document: textul generat din șablon (cu datele persoanei, ale familiei și ale
 * bisericii; pentru darea de seamă — statistica anului) și titlul implicit din registru.
 */
export async function buildDocumentDraft(ctx: Ctx, input: DraftInput): Promise<{ text: string; titlu: string }> {
  const church = await getChurch(ctx);
  let person = null;
  let family: ReturnType<typeof toDocPerson>[] = [];
  if (input.personId) {
    const row = await ctx.db.person.findUnique({ where: { id: input.personId }, select: personRecordSelect });
    if (row) {
      person = toDocPerson(toPersonRecord(row));
      if (row.familie) {
        const fam = await ctx.db.person.findMany({
          where: { familie: row.familie },
          orderBy: [{ sortKey: "asc" }, { id: "asc" }],
          select: personRecordSelect,
        });
        family = fam.map((p) => toDocPerson(toPersonRecord(p)));
      }
    }
  }
  const tip = input.tip as DocumentTypeKey;
  const reportYear = input.anRaport ?? Number(input.data.slice(0, 4));
  const reportText = tip === "raport" ? await generateReportText(ctx, reportYear) : undefined;
  const text = generateDocumentText({ tip, person, family, church, catre: input.catre, scop: input.scop, reportText });
  const titlu = tip === "raport" ? `Dare de seamă anuală ${reportYear}` : defaultDocumentTitle(tip, person, input.catre);
  return { text, titlu };
}

export async function personForDocument(ctx: Ctx, id: string) {
  return ctx.db.person.findUnique({ where: { id }, select: { id: true, nume: true, prenume: true } });
}

