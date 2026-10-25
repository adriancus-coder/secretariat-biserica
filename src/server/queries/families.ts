import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { memberName } from "@/lib/format";
import { compareRo, searchTerms } from "@/lib/text";
import type { Ctx } from "../session";

export const FAMILIES_PAGE_SIZE = 30;

/** Families matching the search (family name, or the name / phone of a member), by name. */
export async function listFamilyRecords(ctx: Ctx, { q, page }: { q: string; page: number }) {
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
      head: { select: { nume: true, prenume: true, sortKey: true } },
      _count: { select: { members: true } },
    },
  });
  // By the head's surname and first name (Romanian alphabet), like the persons list.
  const sorted = rows.sort((a, b) => (a.head?.sortKey ?? "~").localeCompare(b.head?.sortKey ?? "~") || compareRo(a.nume, b.nume));
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / FAMILIES_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  return {
    items: sorted.slice((current - 1) * FAMILIES_PAGE_SIZE, current * FAMILIES_PAGE_SIZE).map((f) => ({
      id: f.id,
      nume: f.nume,
      adresa: f.adresa,
      head: f.head ? memberName(f.head) : "",
      count: f._count.members,
    })),
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
