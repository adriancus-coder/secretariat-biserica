import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate, todayIso } from "@/lib/dates";
import { COMMITTEE_FILTER, NO_FAMILY_FILTER } from "@/lib/roles";
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

/** Fiecare termen trebuie să apară în textul de căutare (nume, telefon, e-mail — fără diacritice). */
export function searchWhere(q: string): Prisma.PersonWhereInput {
  const terms = searchTerms(q);
  return terms.length ? { AND: terms.map((t) => ({ searchText: { contains: t } })) } : {};
}

const listSelect = {
  id: true,
  nume: true,
  prenume: true,
  statut: true,
  familyId: true,
  family: { select: { nume: true } },
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
  /** Display name of the person's family ("Fam. Daniel Mureșan"), or "". */
  familie: string;
  rudenie: string;
  telefon: string;
  dataNasterii: string | null;
  dataIesire: string | null;
}

function toItem(p: Prisma.PersonGetPayload<{ select: typeof listSelect }>): PersonListItem {
  return {
    id: p.id,
    nume: p.nume,
    prenume: p.prenume,
    statut: p.statut,
    familie: p.family?.nume ?? "",
    rudenie: p.rudenie,
    telefon: p.telefon,
    dataNasterii: fromDbDate(p.dataNasterii),
    dataIesire: fromDbDate(p.dataIesire),
  };
}

/**
 * The "Funcție" filter: "" = any person, COMMITTEE_FILTER = persons with the committee flag,
 * otherwise a role id. Roles with an end date in the past do not count.
 */
export function roleWhere(functie: string): Prisma.PersonWhereInput {
  if (!functie) return {};
  if (functie === NO_FAMILY_FILTER) return { familyId: null };
  const current = { OR: [{ until: null }, { until: { gte: toDbDate(todayIso())! } }] };
  if (functie === COMMITTEE_FILTER) return { inComitet: true };
  return { roles: { some: { ...current, roleId: functie } } };
}

export interface ListParams {
  filter: PersonFilter;
  q: string;
  page: number;
  /** See roleWhere. */
  functie?: string;
}

export async function listPersons(ctx: Ctx, { filter, q, page, functie = "" }: ListParams) {
  const where: Prisma.PersonWhereInput = { AND: [filterWhere(filter), searchWhere(q), roleWhere(functie)] };
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
  familyId: string | null;
  label: string;
  count: number;
  members: PersonListItem[];
}

/**
 * Vederea pe familii, paginată după familii: one group per family record (two families with the same
 * surname stay separate), sorted by the head's name; persons without a family come last.
 * Members are ordered by kinship.
 */
/** The families of the persons matching `where`, in the order of the family view (by the head's name; no family last). */
async function orderedFamilies(ctx: Ctx, where: Prisma.PersonWhereInput) {
  const groups = await ctx.db.person.groupBy({ by: ["familyId"], where, _count: { _all: true } });
  const ids = groups.map((g) => g.familyId).filter((x): x is string => x !== null);
  const records = new Map(
    (
      await ctx.db.family.findMany({ where: { id: { in: ids } }, select: { id: true, nume: true, head: { select: { sortKey: true } } } })
    ).map((f) => [f.id, f]),
  );
  const key = (id: string | null) => (id ? (records.get(id)?.head?.sortKey ?? "~") : "~~~");
  return groups
    .map((g) => ({ familyId: g.familyId, label: g.familyId ? (records.get(g.familyId)?.nume ?? NO_FAMILY) : NO_FAMILY, count: g._count._all }))
    .sort((a, b) => key(a.familyId).localeCompare(key(b.familyId)) || compareRo(a.label, b.label));
}

const kinshipRank = (rudenieOrder: string[]) => (r: string) => {
  const i = rudenieOrder.indexOf(r);
  return i < 0 ? 99 : i;
};

export async function listFamilies(ctx: Ctx, { filter, q, page, functie = "" }: ListParams, rudenieOrder: string[]) {
  const where: Prisma.PersonWhereInput = { AND: [filterWhere(filter), searchWhere(q), roleWhere(functie)] };
  const [families, inRecord, anyPerson] = await Promise.all([
    orderedFamilies(ctx, where),
    ctx.db.person.count({ where: { dataIesire: null } }),
    ctx.db.person.count(),
  ]);
  const total = families.reduce((s, f) => s + f.count, 0);
  const pages = Math.max(1, Math.ceil(families.length / FAMILY_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const pageFamilies = families.slice((current - 1) * FAMILY_PAGE_SIZE, current * FAMILY_PAGE_SIZE);
  const rows = pageFamilies.length
    ? await ctx.db.person.findMany({
        where: {
          AND: [
            where,
            {
              OR: [
                { familyId: { in: pageFamilies.map((f) => f.familyId).filter((x): x is string => x !== null) } },
                ...(pageFamilies.some((f) => f.familyId === null) ? [{ familyId: null }] : []),
              ],
            },
          ],
        },
        orderBy: ORDER,
        select: listSelect,
      })
    : [];
  const rank = kinshipRank(rudenieOrder);
  const result: FamilyGroup[] = pageFamilies.map((f) => ({
    ...f,
    members: rows
      .filter((r) => r.familyId === f.familyId)
      .map(toItem)
      .sort((a, b) => rank(a.rudenie) - rank(b.rudenie)),
  }));
  return { groups: result, total, families: families.length, page: current, pages, inRecord, anyPerson };
}

// ---------- Previous / next person, following the list the user came from ----------

/** The Persoane list a person page was opened from (its URL query, carried in `?din=`). */
export interface PersonListSpec {
  /** null: all persons (fallback when the page was not opened from the list). */
  filter: PersonFilter | null;
  byFamily: boolean;
  q: string;
  functie: string;
}

const ALL_PERSONS: PersonListSpec = { filter: null, byFamily: false, q: "", functie: "" };

/** Reads the list query ("filtru=toate&q=pop…"); anything unknown falls back to the defaults. */
export function parseListSpec(din: string | undefined): PersonListSpec {
  if (din === undefined) return ALL_PERSONS;
  const sp = new URLSearchParams(din);
  const filtru = sp.get("filtru") ?? "";
  const functie = sp.get("functie") ?? "";
  return {
    filter: (PERSON_FILTERS as readonly string[]).includes(filtru) ? (filtru as PersonFilter) : "membri",
    byFamily: sp.get("vedere") === "familii",
    q: (sp.get("q") ?? "").slice(0, 100),
    functie: functie === COMMITTEE_FILTER || functie === NO_FAMILY_FILTER || /^[A-Za-z0-9_-]{1,64}$/.test(functie) ? functie : "",
  };
}

/** The ids of the list, in the order it shows them (alphabetical, or by family then kinship). */
export async function personOrder(ctx: Ctx, spec: PersonListSpec, rudenieOrder: string[]): Promise<string[]> {
  const where: Prisma.PersonWhereInput = spec.filter
    ? { AND: [filterWhere(spec.filter), searchWhere(spec.q), roleWhere(spec.functie)] }
    : {};
  const rows = await ctx.db.person.findMany({ where, orderBy: ORDER, select: { id: true, familyId: true, rudenie: true } });
  if (!spec.byFamily) return rows.map((r) => r.id);
  const rank = kinshipRank(rudenieOrder);
  const families = await orderedFamilies(ctx, where);
  return families.flatMap((f) =>
    rows
      .filter((r) => r.familyId === f.familyId)
      .sort((a, b) => rank(a.rudenie) - rank(b.rudenie))
      .map((r) => r.id),
  );
}

export interface PersonNeighbors {
  prev: string | null;
  next: string | null;
  /** 1-based position in the list; 0 when the person is not in it. */
  position: number;
  total: number;
}

export async function personNeighbors(ctx: Ctx, id: string, spec: PersonListSpec, rudenieOrder: string[]): Promise<PersonNeighbors> {
  const ids = await personOrder(ctx, spec, rudenieOrder);
  const i = ids.indexOf(id);
  if (i < 0) return { prev: null, next: null, position: 0, total: ids.length };
  return { prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null, position: i + 1, total: ids.length };
}

export async function getPerson(ctx: Ctx, id: string) {
  return ctx.db.person.findUnique({ where: { id } });
}

/** Fișa persoanei: datele, familia, grupurile, mențiunile, documentele și istoricul modificărilor. */
export async function getPersonDetail(ctx: Ctx, id: string) {
  const person = await ctx.db.person.findUnique({
    where: { id },
    include: {
      groups: { include: { group: { select: { id: true, nume: true } } } },
      responsibleFor: { select: { id: true, nume: true } },
      application: { select: { id: true, createdAt: true } },
      roles: { include: { role: { select: { nume: true, sortOrder: true, group: { select: { id: true, nume: true, sortOrder: true } } } } } },
      family: { select: { id: true, nume: true, headId: true } },
    },
  });
  if (!person) return null;
  const [family, notes, notesCount, documents, audit, aliases] = await Promise.all([
    person.familyId
      ? ctx.db.person.findMany({
          where: { familyId: person.familyId, id: { not: id } },
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
    ctx.db.personAlias.findMany({ where: { personId: id }, orderBy: { alias: "asc" }, select: { id: true, alias: true } }),
  ]);
  return {
    person,
    groups: person.groups.map((g) => ({ ...g.group, auto: g.sursa === "AUTO" })).sort((a, b) => compareRo(a.nume, b.nume)),
    responsibleFor: [...person.responsibleFor].sort((a, b) => compareRo(a.nume, b.nume)),
    roles: person.roles
      .map((r) => ({ ...r.role, since: fromDbDate(r.since) }))
      .sort((a, b) => a.group.sortOrder - b.group.sortOrder || a.sortOrder - b.sortOrder || compareRo(a.nume, b.nume)),
    family,
    notes,
    notesCount,
    documents,
    audit,
    aliases,
  };
}

/** The families' names (suggestions for the free-text family of a note). */
export async function familyNames(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.family.findMany({ select: { nume: true } });
  return [...new Set(rows.map((r) => r.nume))].sort(compareRo);
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
