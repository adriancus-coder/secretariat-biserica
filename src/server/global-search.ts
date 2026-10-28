import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { fromDbDate } from "@/lib/dates";
import { fmt, memberName } from "@/lib/format";
import { APPLICATION_STATUS_LABEL, DOCUMENT_TYPE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { searchPages } from "@/lib/search-index";
import { normalizeSearch, searchTerms } from "@/lib/text";
import type { Ctx } from "./session";

/*
 * GLOBAL-SEARCH on the server: the pages the user may open (src/lib/search-index.ts) and the church's
 * data, by group, each with the permission of its list (all `read`: the Rugăciune role gets pages only).
 * Persons through the scoped client and the trigram index of `searchText`; the other groups with raw SQL
 * on short columns, ALWAYS with an explicit `"churchId" = …` (raw SQL is not scoped). Never searched:
 * disciplinary measures, pastoral notes, the text of minutes or letters, unapproved campaign answers.
 * The query is never written to the log.
 */

export interface SearchHit {
  title: string;
  subtitle: string;
  href: string;
}
export interface SearchGroup {
  key: string;
  label: string;
  total: number;
  items: SearchHit[];
}

export const SEARCH_GROUPS = ["pagini", "persoane", "familii", "documente", "sedinte", "corespondenta", "patrimoniu", "grupuri", "mentiuni", "cereri"] as const;
export type SearchGroupKey = (typeof SEARCH_GROUPS)[number];
export const SEARCH_GROUP_LABEL: Record<SearchGroupKey, string> = {
  pagini: "Pagini și setări",
  persoane: "Persoane",
  familii: "Familii",
  documente: "Documente",
  sedinte: "Ședințe",
  corespondenta: "Corespondență",
  patrimoniu: "Patrimoniu",
  grupuri: "Grupuri",
  mentiuni: "Mențiuni",
  cereri: "Cereri",
};
export const SEARCH_MIN = 2;

/** Lower case without Romanian diacritics, in SQL (also when the database collation is "C"). */
const fold = (expr: Prisma.Sql) => Prisma.sql`lower(translate(${expr}, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt'))`;
const like = (t: string) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Every term in the folded haystack (or, for a term naming an enum label, in that column). */
function allTerms(hay: Prisma.Sql, terms: string[], enumMatch?: (t: string) => Prisma.Sql | null): Prisma.Sql {
  return Prisma.join(
    terms.map((t) => {
      const extra = enumMatch?.(t);
      return extra ? Prisma.sql`(${fold(hay)} LIKE ${like(t)} OR ${extra})` : Prisma.sql`${fold(hay)} LIKE ${like(t)}`;
    }),
    " AND ",
  );
}

type Row = { id: string; total: bigint } & Record<string, unknown>;
const total = (rows: Row[]) => Number(rows[0]?.total ?? 0);
const d = (v: unknown) => (v instanceof Date ? fmt(fromDbDate(v)) : "");

/** The data groups (each up to `limit` hits, with its total). `only` = one group (the „Vezi toate” page). */
export async function searchData(ctx: Ctx, q: string, limit: number, only?: SearchGroupKey): Promise<SearchGroup[]> {
  const terms = searchTerms(q);
  if (normalizeSearch(q).length < SEARCH_MIN || !terms.length || !permissions.read(ctx.user)) return [];
  const church = ctx.user.churchId;
  const want = (k: SearchGroupKey) => !only || only === k;
  const docTypes = (t: string) => {
    const keys = Object.entries(DOCUMENT_TYPE_LABEL)
      .filter(([, label]) => normalizeSearch(label).includes(t))
      .map(([k]) => k);
    return keys.length ? Prisma.sql`d."tip"::text = ANY(${keys})` : null;
  };
  const tasks: Promise<SearchGroup | null>[] = [];

  if (want("persoane")) {
    tasks.push(
      (async () => {
        const where: Prisma.PersonWhereInput = { AND: terms.map((t) => ({ OR: [{ searchText: { contains: t } }, { aliases: { some: { alias: { contains: t } } } }] })) };
        const [rows, n] = await Promise.all([
          ctx.db.person.findMany({ where, orderBy: [{ sortKey: "asc" }, { id: "asc" }], take: limit, select: { id: true, nume: true, prenume: true, statut: true, family: { select: { nume: true } } } }),
          ctx.db.person.count({ where }),
        ]);
        return {
          key: "persoane",
          label: SEARCH_GROUP_LABEL.persoane,
          total: n,
          items: rows.map((p) => ({ title: memberName(p), subtitle: [STATUS_LABEL[p.statut], p.family?.nume].filter(Boolean).join(" · "), href: `/persoane/${p.id}` })),
        };
      })(),
    );
  }
  if (want("familii")) {
    tasks.push(
      ctx.db
        .$queryRaw<Row[]>(
          Prisma.sql`SELECT f.id, f.nume, h.nume AS hnume, h.prenume AS hprenume, count(*) OVER () AS total
            FROM families f LEFT JOIN persons h ON h.id = f."headId"
            WHERE f."churchId" = ${church} AND ${allTerms(Prisma.sql`concat_ws(' ', f.nume, h.nume, h.prenume)`, terms)}
            ORDER BY f.nume LIMIT ${limit}`,
        )
        .then((rows) => ({
          key: "familii",
          label: SEARCH_GROUP_LABEL.familii,
          total: total(rows),
          items: rows.map((r) => ({ title: String(r.nume), subtitle: r.hnume ? `Cap de familie: ${memberName({ nume: r.hnume as string, prenume: r.hprenume as string })}` : "", href: `/familii/${r.id}` })),
        })),
    );
  }
  if (want("documente")) {
    tasks.push(
      ctx.db
        .$queryRaw<Row[]>(
          Prisma.sql`SELECT d.id, d.nr, d."anRegistru", d.tip::text AS tip, d.titlu, d.persoana, d.data, count(*) OVER () AS total
            FROM documents d
            WHERE d."churchId" = ${church} AND ${allTerms(Prisma.sql`concat_ws(' ', d.nr || '/' || d."anRegistru", d.titlu, d.persoana, d.catre)`, terms, docTypes)}
            ORDER BY d.data DESC, d.nr DESC LIMIT ${limit}`,
        )
        .then((rows) => ({
          key: "documente",
          label: SEARCH_GROUP_LABEL.documente,
          total: total(rows),
          items: rows.map((r) => {
            const label = DOCUMENT_TYPE_LABEL[r.tip as keyof typeof DOCUMENT_TYPE_LABEL] ?? String(r.tip);
            return { title: `Nr. ${r.nr}/${r.anRegistru} — ${r.titlu || label}`, subtitle: [label, r.persoana, d(r.data)].filter(Boolean).join(" · "), href: `/documente/${r.id}` };
          }),
        })),
    );
  }
  if (want("sedinte")) {
    tasks.push(
      ctx.db
        .$queryRaw<Row[]>(
          Prisma.sql`SELECT m.id, m.nr, m."anRegistru", m.tip, m.titlu, m.data, count(*) OVER () AS total
            FROM meetings m
            WHERE m."churchId" = ${church} AND ${allTerms(Prisma.sql`concat_ws(' ', CASE WHEN m.nr IS NULL THEN NULL ELSE m.nr || '/' || m."anRegistru" END, m.tip, m.titlu, to_char(m.data, 'DD.MM.YYYY'), to_char(m.data, 'YYYY-MM-DD'))`, terms)}
            ORDER BY m.data DESC LIMIT ${limit}`,
        )
        .then((rows) => ({
          key: "sedinte",
          label: SEARCH_GROUP_LABEL.sedinte,
          total: total(rows),
          items: rows.map((r) => ({ title: `${r.nr != null ? `PV nr. ${r.nr}/${r.anRegistru} — ` : ""}${r.titlu || r.tip}`, subtitle: [r.tip, d(r.data)].join(" · "), href: `/procese-verbale/${r.id}` })),
        })),
    );
  }
  if (want("corespondenta")) {
    tasks.push(
      ctx.db
        .$queryRaw<Row[]>(
          Prisma.sql`SELECT c.id, c.nr, c.an, c.directie::text AS directie, c.dela, c.catre, c.subiect, c.data, count(*) OVER () AS total
            FROM correspondence c
            WHERE c."churchId" = ${church} AND ${allTerms(Prisma.sql`concat_ws(' ', c.nr || '/' || c.an, c.dela, c.catre, c.subiect)`, terms)}
            ORDER BY c.data DESC, c.nr DESC LIMIT ${limit}`,
        )
        .then((rows) => ({
          key: "corespondenta",
          label: SEARCH_GROUP_LABEL.corespondenta,
          total: total(rows),
          items: rows.map((r) => ({
            title: `Nr. ${r.nr}/${r.an} — ${r.subiect}`,
            subtitle: [r.directie === "INTRARE" ? `Intrare de la ${r.dela || "—"}` : `Ieșire către ${r.catre || "—"}`, d(r.data)].join(" · "),
            href: `/corespondenta/${r.id}`,
          })),
        })),
    );
  }
  if (want("patrimoniu")) {
    tasks.push(
      ctx.db
        .$queryRaw<Row[]>(
          Prisma.sql`SELECT a.id, a."nrInventar", a.denumire, a.categorie, s.nume AS sub, count(*) OVER () AS total
            FROM assets a LEFT JOIN asset_subcategories s ON s.id = a."subcategoryId"
            WHERE a."churchId" = ${church} AND ${allTerms(Prisma.sql`concat_ws(' ', a."nrInventar"::text, a.denumire, a.categorie, s.nume, a.loc)`, terms)}
            ORDER BY a."nrInventar" LIMIT ${limit}`,
        )
        .then((rows) => ({
          key: "patrimoniu",
          label: SEARCH_GROUP_LABEL.patrimoniu,
          total: total(rows),
          items: rows.map((r) => ({ title: `Nr. inv. ${r.nrInventar} — ${r.denumire}`, subtitle: [r.categorie, r.sub].filter(Boolean).join(" › "), href: `/patrimoniu/${r.id}` })),
        })),
    );
  }
  if (want("grupuri")) {
    tasks.push(
      ctx.db
        .$queryRaw<Row[]>(
          Prisma.sql`SELECT g.id, g.nume, count(*) OVER () AS total FROM groups g
            WHERE g."churchId" = ${church} AND ${allTerms(Prisma.sql`g.nume`, terms)} ORDER BY g.nume LIMIT ${limit}`,
        )
        .then((rows) => ({ key: "grupuri", label: SEARCH_GROUP_LABEL.grupuri, total: total(rows), items: rows.map((r) => ({ title: String(r.nume), subtitle: "", href: `/grupuri/${r.id}` })) })),
    );
  }
  if (want("mentiuni")) {
    tasks.push(
      (async () => {
        const where: Prisma.NoteWhereInput = { AND: terms.map((t) => ({ searchText: { contains: t } })) };
        const [rows, n] = await Promise.all([
          ctx.db.note.findMany({ where, orderBy: { data: "desc" }, take: limit, select: { id: true, tip: true, data: true, person: { select: { nume: true, prenume: true } } } }),
          ctx.db.note.count({ where }),
        ]);
        return {
          key: "mentiuni",
          label: SEARCH_GROUP_LABEL.mentiuni,
          total: n,
          items: rows.map((r) => ({ title: r.tip, subtitle: [r.person ? memberName(r.person) : "", d(r.data)].filter(Boolean).join(" · "), href: `/mentiuni/${r.id}` })),
        };
      })(),
    );
  }
  if (want("cereri")) {
    tasks.push(
      ctx.db
        .$queryRaw<Row[]>(
          Prisma.sql`SELECT a.id, a.nume, a.prenume, a.status::text AS status, a."createdAt", count(*) OVER () AS total FROM applications a
            WHERE a."churchId" = ${church} AND ${allTerms(Prisma.sql`concat_ws(' ', a.nume, a.prenume)`, terms)} ORDER BY a."createdAt" DESC LIMIT ${limit}`,
        )
        .then((rows) => ({
          key: "cereri",
          label: SEARCH_GROUP_LABEL.cereri,
          total: total(rows),
          items: rows.map((r) => ({ title: memberName({ nume: r.nume as string, prenume: r.prenume as string }), subtitle: APPLICATION_STATUS_LABEL[r.status as keyof typeof APPLICATION_STATUS_LABEL] ?? "", href: `/cereri/${r.id}` })),
        })),
    );
  }
  return (await Promise.all(tasks)).filter((g): g is SearchGroup => g !== null && g.total > 0);
}

/** The pages group for this user. */
export function searchPageGroup(ctx: Pick<Ctx, "user">, q: string, limit: number): SearchGroup | null {
  if (normalizeSearch(q).length < SEARCH_MIN) return null;
  const all = searchPages(q, ctx.user);
  return all.length ? { key: "pagini", label: SEARCH_GROUP_LABEL.pagini, total: all.length, items: all.slice(0, limit).map((x) => ({ title: x.title, subtitle: x.path, href: x.href })) } : null;
}
