import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatAddress } from "@/lib/address";
import { ageAt, fromDbDate } from "@/lib/dates";
import { isChurchFamily } from "@/lib/families";
import { memberName } from "@/lib/format";
import { STATUS_LABEL_SHORT } from "@/lib/labels";
import { compareRo, searchTerms } from "@/lib/text";
import type { Ctx } from "../session";

export const FAMILIES_PAGE_SIZE = 30;

/** FAMILIES-WITH-MEMBERS: the Familii list shows the families of the church by default (isChurchFamily). */
export const FAMILY_FILTERS = ["biserica", "fara-membri", "toate"] as const;
export type FamilyFilter = (typeof FAMILY_FILTERS)[number];
export const FAMILY_FILTER_LABEL: Record<FamilyFilter, string> = { biserica: "Familiile bisericii", "fara-membri": "Fără membri", toate: "Toate" };

/**
 * Families matching the search (family name, or the name / phone of a member) within the chosen filter,
 * by name; `counts` gives each filter's number for the same search.
 */
export async function listFamilyRecords(ctx: Ctx, { q, page, filter = "biserica" }: { q: string; page: number; filter?: FamilyFilter }) {
  const terms = searchTerms(q);
  const where: Prisma.FamilyWhereInput = terms.length
    ? {
        AND: terms.map((t) => ({
          OR: [{ nume: { contains: t, mode: "insensitive" as const } }, { members: { some: { searchText: { contains: t } } } }],
        })),
      }
    : {};
  const rows = await ctx.db.family.findMany({
    where,
    select: {
      id: true,
      nume: true,
      adresa: true,
      codPostal: true,
      localitate: true,
      head: { select: { nume: true, prenume: true, sortKey: true } },
      _count: { select: { members: true } },
      members: { select: { statut: true, dataIesire: true, nume: true } },
    },
  });
  const all = rows.map((f) => ({ ...f, church: isChurchFamily(f.members) }));
  const counts: Record<FamilyFilter, number> = { biserica: all.filter((f) => f.church).length, "fara-membri": all.filter((f) => !f.church).length, toate: all.length };
  const chosen = filter === "toate" ? all : all.filter((f) => f.church === (filter === "biserica"));
  // By the head's surname and first name (Romanian alphabet), like the persons list.
  const sorted = chosen.sort((a, b) => (a.head?.sortKey ?? "~").localeCompare(b.head?.sortKey ?? "~") || compareRo(a.nume, b.nume));
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / FAMILIES_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  return {
    items: sorted.slice((current - 1) * FAMILIES_PAGE_SIZE, current * FAMILIES_PAGE_SIZE).map((f) => ({
      id: f.id,
      nume: f.nume,
      adresa: formatAddress(f),
      head: f.head ? memberName(f.head) : "",
      count: f._count.members,
      church: f.church,
    })),
    counts,
    total,
    page: current,
    pages,
  };
}

/** The family page: head, members (head first, then by kinship order and name), address, notes. */
export async function getFamily(ctx: Ctx, id: string, rudenieOrder: string[]) {
  const f = await ctx.db.family.findUnique({
    where: { id },
    include: {
      members: {
        orderBy: [{ sortKey: "asc" }, { id: "asc" }],
        select: { id: true, nume: true, prenume: true, rudenie: true, statut: true, dataNasterii: true, dataIesire: true },
      },
    },
  });
  if (!f) return null;
  const rank = (r: string) => {
    const i = rudenieOrder.indexOf(r);
    return i < 0 ? 99 : i;
  };
  const members = [...f.members].sort((a, b) => Number(b.id === f.headId) - Number(a.id === f.headId) || rank(a.rudenie) - rank(b.rudenie));
  return { ...f, members };
}

export interface FamilyOption {
  id: string;
  label: string;
}

/** Families for selects: "Fam. Daniel Mureșan (3)", by name. */
export async function familyOptions(ctx: Ctx): Promise<FamilyOption[]> {
  const rows = await ctx.db.family.findMany({ select: { id: true, nume: true, _count: { select: { members: true } } } });
  return rows.sort((a, b) => compareRo(a.nume, b.nume)).map((f) => ({ id: f.id, label: `${f.nume} (${f._count.members})` }));
}

export interface FamilyCandidate {
  id: string;
  name: string;
  /** "34 ani · Membru" */
  note: string;
}

/** Persons in the record without a family, for "Adaugă membri" (by name). */
export async function personsWithoutFamily(ctx: Ctx, today: string): Promise<FamilyCandidate[]> {
  const rows = await ctx.db.person.findMany({
    where: { familyId: null, dataIesire: null, statut: { not: "FOST_MEMBRU" } },
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
    select: { id: true, nume: true, prenume: true, statut: true, dataNasterii: true },
  });
  return rows.map((p) => {
    const dn = fromDbDate(p.dataNasterii);
    return { id: p.id, name: memberName(p), note: [dn ? `${ageAt(dn, today)} ani` : "", STATUS_LABEL_SHORT[p.statut]].filter(Boolean).join(" · ") };
  });
}
