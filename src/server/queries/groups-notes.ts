import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ChecklistOption } from "@/components/person-checklist";
import { fromDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { compareRo, searchTerms } from "@/lib/text";
import type { Ctx } from "../session";

// ---------- Grupuri ----------

export async function listGroups(ctx: Ctx) {
  const rows = await ctx.db.group.findMany({
    select: { id: true, nume: true, responsabil: true, _count: { select: { membri: true } } },
  });
  return rows
    .map((g) => ({ id: g.id, nume: g.nume, responsabil: g.responsabil, count: g._count.membri }))
    .sort((a, b) => compareRo(a.nume, b.nume));
}

export async function getGroup(ctx: Ctx, id: string) {
  const g = await ctx.db.group.findUnique({
    where: { id },
    include: {
      membri: { include: { person: { select: { id: true, nume: true, prenume: true, telefon: true, dataIesire: true } } } },
    },
  });
  if (!g) return null;
  const membri = g.membri
    .map((m) => m.person)
    .sort((a, b) => compareRo(memberName(a), memberName(b)));
  return { ...g, membri };
}

/** Persoanele care pot fi adăugate într-un grup: cele în evidență + cele deja membre. */
export async function groupMemberOptions(ctx: Ctx, selected: string[]): Promise<ChecklistOption[]> {
  const rows = await ctx.db.person.findMany({
    where: { OR: [{ dataIesire: null }, { id: { in: selected } }] },
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
    select: { id: true, nume: true, prenume: true, dataIesire: true },
  });
  return rows.map((r) => ({ id: r.id, name: memberName(r), note: r.dataIesire ? "ieșit din evidență" : undefined }));
}

// ---------- Mențiuni ----------

export const NOTES_PAGE_SIZE = 40;

export async function listNotes(ctx: Ctx, { q, personId, page }: { q: string; personId: string | null; page: number }) {
  const terms = searchTerms(q);
  const where: Prisma.NoteWhereInput = {
    AND: [
      personId ? { personId } : {},
      ...terms.map(
        (t): Prisma.NoteWhereInput => ({
          OR: [{ searchText: { contains: t } }, { person: { searchText: { contains: t } } }],
        }),
      ),
    ],
  };
  const total = await ctx.db.note.count({ where });
  const pages = Math.max(1, Math.ceil(total / NOTES_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await ctx.db.note.findMany({
    where,
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    skip: (current - 1) * NOTES_PAGE_SIZE,
    take: NOTES_PAGE_SIZE,
    include: { person: { select: { id: true, nume: true, prenume: true } } },
  });
  const anyNote = total > 0 || (await ctx.db.note.count()) > 0;
  return {
    items: rows.map((n) => ({ ...n, data: fromDbDate(n.data)!, who: noteWho(n, "Fam. ") })),
    total,
    page: current,
    pages,
    anyNote,
  };
}

/** Cui îi aparține mențiunea: persoana, familia sau „General” (ca în prototip). */
export function noteWho(
  n: { person: { nume: string; prenume: string } | null; familie: string },
  familyPrefix = "Familia ",
): string {
  return n.person ? memberName(n.person) : n.familie ? `${familyPrefix}${n.familie}` : "General";
}

export async function getNote(ctx: Ctx, id: string) {
  const n = await ctx.db.note.findUnique({
    where: { id },
    include: { person: { select: { id: true, nume: true, prenume: true } } },
  });
  if (!n) return null;
  return { ...n, data: fromDbDate(n.data)! };
}
