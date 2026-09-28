import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate } from "@/lib/dates";
import { searchTerms, compareRo } from "@/lib/text";
import type { PersonStatusKey } from "@/lib/labels";
import { ActionError, type Ctx } from "../session";

export const PERSON_FILTERS = ["membri", "toate", "foste"] as const;
export type PersonFilter = (typeof PERSON_FILTERS)[number];
export const PERSON_FILTER_LABEL: Record<PersonFilter, string> = { membri: "Membri", toate: "Toate", foste: "Foști" };

export const PAGE_SIZE = 50;
export const FAMILY_PAGE_SIZE = 20;
export const NO_FAMILY = "— fără familie —";

const ORDER = [{ sortKey: "asc" }, { id: "asc" }] satisfies Prisma.PersonOrderByWithRelationInput[];

/**
 * Filtrele din prototip:
 * - Membri: statut „Membru” (fără persoanele ieșite din evidență, ex. decedate);
 * - Toate: persoanele în evidență (nu foști membri, fără dată de ieșire);
 * - Foști: statut „Fost membru” sau cu dată de ieșire.
 */
export function filterWhere(filter: PersonFilter): Prisma.PersonWhereInput {
  switch (filter) {
    case "membri":
      return { statut: "MEMBRU", dataIesire: null };
    case "foste":
      return { OR: [{ statut: "FOST_MEMBRU" }, { dataIesire: { not: null } }] };
    default:
      return { statut: { not: "FOST_MEMBRU" }, dataIesire: null };
  }
}

/** Fiecare termen trebuie să apară în textul de căutare (nume, familie, telefon, e-mail — fără diacritice). */
export function searchWhere(q: string): Prisma.PersonWhereInput {
  const terms = searchTerms(q);
  return terms.length ? { AND: terms.map((t) => ({ searchText: { contains: t } })) } : {};
}

const listSelect = {
  id: true,
  nume: true,
  prenume: true,
  statut: true,
  familie: true,
  rudenie: true,
  telefon: true,
  dataNasterii: true,
  dataIesire: true,
} satisfies Prisma.PersonSelect;

export interface PersonListItem {
  id: string;
  nume: string;
  prenume: string;
  statut: PersonStatusKey;
  familie: string;
  rudenie: string;
  telefon: string;
  dataNasterii: string | null;
  dataIesire: string | null;
}

function toItem(p: Prisma.PersonGetPayload<{ select: typeof listSelect }>): PersonListItem {
  return { ...p, dataNasterii: fromDbDate(p.dataNasterii), dataIesire: fromDbDate(p.dataIesire) };
}

export interface ListParams {
  filter: PersonFilter;
  q: string;
  page: number;
}

export async function listPersons(ctx: Ctx, { filter, q, page }: ListParams) {
  const where: Prisma.PersonWhereInput = { AND: [filterWhere(filter), searchWhere(q)] };
  const [total, inRecord, anyPerson] = await Promise.all([
    ctx.db.person.count({ where }),
    ctx.db.person.count({ where: { dataIesire: null } }),
    ctx.db.person.count(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await ctx.db.person.findMany({
    where,
    orderBy: ORDER,
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: listSelect,
  });
  return { items: rows.map(toItem), total, page: current, pages, inRecord, anyPerson };
}

export interface FamilyGroup {
  familie: string;
  label: string;
  count: number;
  members: PersonListItem[];
}

/** Vederea pe familii, paginată după familii (ordonate alfabetic), membrii ordonați după gradul de rudenie. */
export async function listFamilies(ctx: Ctx, { filter, q, page }: ListParams, rudenieOrder: string[]) {
  const where: Prisma.PersonWhereInput = { AND: [filterWhere(filter), searchWhere(q)] };
  const [groups, inRecord, anyPerson] = await Promise.all([
    ctx.db.person.groupBy({ by: ["familie"], where, _count: { _all: true } }),
    ctx.db.person.count({ where: { dataIesire: null } }),
    ctx.db.person.count(),
  ]);
  const families = groups
    .map((g) => ({ familie: g.familie, label: g.familie || NO_FAMILY, count: g._count._all }))
    .sort((a, b) => compareRo(a.label, b.label));
  const total = families.reduce((s, f) => s + f.count, 0);
  const pages = Math.max(1, Math.ceil(families.length / FAMILY_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const pageFamilies = families.slice((current - 1) * FAMILY_PAGE_SIZE, current * FAMILY_PAGE_SIZE);
  const rows = pageFamilies.length
    ? await ctx.db.person.findMany({
        where: { AND: [where, { familie: { in: pageFamilies.map((f) => f.familie) } }] },
        orderBy: ORDER,
        select: listSelect,
      })
    : [];
  const rank = (r: string) => {
    const i = rudenieOrder.indexOf(r);
    return i < 0 ? 99 : i;
  };
  const result: FamilyGroup[] = pageFamilies.map((f) => ({
    ...f,
    members: rows
      .filter((r) => r.familie === f.familie)
      .map(toItem)
      .sort((a, b) => rank(a.rudenie) - rank(b.rudenie)),
  }));
  return { groups: result, total, families: families.length, page: current, pages, inRecord, anyPerson };
}

export async function getPerson(ctx: Ctx, id: string) {
  return ctx.db.person.findUnique({ where: { id } });
}

/** Fișa persoanei: datele, familia, grupurile, mențiunile, documentele și istoricul modificărilor. */
export async function getPersonDetail(ctx: Ctx, id: string) {
  const person = await ctx.db.person.findUnique({
    where: { id },
    include: { groups: { include: { group: { select: { id: true, nume: true } } } } },
  });
  if (!person) return null;
  const [family, notes, notesCount, documents, audit] = await Promise.all([
    person.familie
      ? ctx.db.person.findMany({
          where: { familie: person.familie, id: { not: id } },
          orderBy: ORDER,
          select: { id: true, nume: true, prenume: true, rudenie: true, dataIesire: true },
        })
      : Promise.resolve([]),
    ctx.db.note.findMany({ where: { personId: id }, orderBy: [{ data: "desc" }, { createdAt: "desc" }], take: 5 }),
    ctx.db.note.count({ where: { personId: id } }),
    ctx.db.document.findMany({
      where: { personId: id },
      orderBy: [{ data: "desc" }, { nr: "desc" }],
      select: { id: true, nr: true, anRegistru: true, data: true, titlu: true, tip: true },
    }),
    ctx.db.auditLog.findMany({ where: { entity: "PERSON", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return {
    person,
    groups: person.groups.map((g) => g.group).sort((a, b) => compareRo(a.nume, b.nume)),
    family,
    notes,
    notesCount,
    documents,
    audit,
  };
}

/** Numele de familie existente (pentru sugestii în formulare). */
export async function familyNames(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.person.findMany({
    where: { familie: { not: "" } },
    distinct: ["familie"],
    select: { familie: true },
  });
  return rows.map((r) => r.familie).sort(compareRo);
}

export interface PersonOption {
  id: string;
  name: string;
  statut: PersonStatusKey;
  exited: boolean;
}

/** Persoanele pentru liste de selecție (ordonate alfabetic). */
export async function personOptions(ctx: Ctx): Promise<PersonOption[]> {
  const rows = await ctx.db.person.findMany({
    orderBy: ORDER,
    select: { id: true, nume: true, prenume: true, statut: true, dataIesire: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: `${r.nume} ${r.prenume}`.trim(),
    statut: r.statut,
    exited: r.dataIesire !== null,
  }));
}

/** Verifică faptul că toate id-urile aparțin bisericii curente; întoarce id-urile valide, fără duplicate. */
export async function assertPersonsInChurch(db: Ctx["db"], ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const found = await db.person.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (found.length !== unique.length) {
    throw new ActionError("Una sau mai multe persoane selectate nu mai există în registrul bisericii.");
  }
  return unique;
}
