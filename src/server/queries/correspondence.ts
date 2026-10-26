import "server-only";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { registerRows, type RegisterRow } from "@/lib/correspondence";
import type { Ctx } from "../session";

/** The years that have register rows or documents, newest first, with the current one always there. */
export async function correspondenceYears(ctx: Ctx, current: number): Promise<number[]> {
  const [a, b] = await Promise.all([
    ctx.db.correspondence.findMany({ distinct: ["an"], select: { an: true } }),
    ctx.db.document.findMany({ distinct: ["anRegistru"], select: { anRegistru: true } }),
  ]);
  return [...new Set([current, ...a.map((x) => x.an), ...b.map((x) => x.anRegistru)])].sort((x, y) => y - x);
}

/** The register of a year (CORRESPONDENCE-REGISTER): its own rows and the documents issued that year. */
export async function loadRegister(ctx: Ctx, year: number): Promise<RegisterRow[]> {
  const [entries, documents] = await Promise.all([
    ctx.db.correspondence.findMany({
      where: { an: year },
      include: { document: { select: { nr: true, anRegistru: true } }, raspunsLa: { select: { nr: true, an: true } } },
    }),
    ctx.db.document.findMany({
      where: { data: { gte: toDbDate(`${year}-01-01`)!, lte: toDbDate(`${year}-12-31`)! } },
      select: { id: true, nr: true, anRegistru: true, data: true, catre: true, persoana: true, titlu: true, tip: true },
    }),
  ]);
  return registerRows(
    entries.map((e) => ({ ...e, data: fromDbDate(e.data)! })),
    documents.map((d) => ({ ...d, data: fromDbDate(d.data)!, subiect: d.titlu || DOCUMENT_TYPE_LABEL[d.tip] })),
  );
}

/** One row with its links, for its page. */
export async function getCorrespondence(ctx: Ctx, id: string) {
  const row = await ctx.db.correspondence.findUnique({
    where: { id },
    include: {
      document: { select: { id: true, nr: true, anRegistru: true, titlu: true, tip: true } },
      raspunsLa: { select: { id: true, nr: true, an: true, subiect: true } },
      raspunsuri: { select: { id: true, nr: true, an: true, subiect: true, data: true }, orderBy: { data: "asc" } },
      person: { select: { id: true, nume: true, prenume: true } },
    },
  });
  return row ? { ...row, data: fromDbDate(row.data)! } : null;
}

/** The documents a register exit may point to (newest first), as "12/2026 — Scrisoare". */
export async function documentOptions(ctx: Ctx) {
  const docs = await ctx.db.document.findMany({ orderBy: [{ anRegistru: "desc" }, { nr: "desc" }], take: 300, select: { id: true, nr: true, anRegistru: true, tip: true, titlu: true, catre: true } });
  return docs.map((d) => ({ value: d.id, label: `${d.nr}/${d.anRegistru} — ${d.titlu || DOCUMENT_TYPE_LABEL[d.tip]}${d.catre ? `, către ${d.catre}` : ""}` }));
}
