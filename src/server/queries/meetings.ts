import "server-only";
import { fromDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { storedRich, storedRichList } from "@/lib/schemas/rich-text";
import type { ChecklistOption } from "@/components/person-checklist";
import type { Ctx } from "../session";

export const MEETINGS_PAGE_SIZE = 30;

export async function listMeetings(ctx: Ctx, page: number) {
  const total = await ctx.db.meeting.count();
  const pages = Math.max(1, Math.ceil(total / MEETINGS_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await ctx.db.meeting.findMany({
    orderBy: [{ data: "desc" }, { ora: "desc" }, { createdAt: "desc" }],
    skip: (current - 1) * MEETINGS_PAGE_SIZE,
    take: MEETINGS_PAGE_SIZE,
    select: {
      id: true,
      titlu: true,
      tip: true,
      data: true,
      nr: true,
      anRegistru: true,
      puncte: true,
      _count: { select: { prezenti: { where: { status: "PRESENT" } } } },
    },
  });
  return {
    items: rows.map((m) => ({
      id: m.id,
      titlu: m.titlu,
      tip: m.tip,
      data: fromDbDate(m.data)!,
      prezenti: m._count.prezenti,
      puncte: m.puncte.length,
      nr: m.nr,
      anRegistru: m.anRegistru,
    })),
    total,
    page: current,
    pages,
  };
}

export async function getMeeting(ctx: Ctx, id: string) {
  const m = await ctx.db.meeting.findUnique({
    where: { id },
    include: {
      prezenti: { include: { person: { select: { id: true, nume: true, prenume: true, sortKey: true, email: true } } } },
      signatures: { select: { personId: true, signedAt: true, imagePng: true } },
      sends: { orderBy: { sentAt: "desc" }, take: 20, include: { sentBy: { select: { name: true } } } },
    },
  });
  if (!m) return null;
  const signed = new Map(m.signatures.map((s) => [s.personId, { signedAt: s.signedAt, png: Buffer.from(s.imagePng) }]));
  const list = (status: "PRESENT" | "ABSENT") =>
    m.prezenti
      .filter((p) => p.status === status)
      .sort((a, b) => a.person.sortKey.localeCompare(b.person.sortKey))
      .map((p) => ({
        id: p.person.id,
        name: memberName(p.person),
        nume: p.person.nume,
        prenume: p.person.prenume,
        email: p.person.email,
        signature: status === "PRESENT" ? (signed.get(p.person.id) ?? null) : null,
      }));
  return {
    ...m,
    data: fromDbDate(m.data)!,
    prezenti: list("PRESENT"),
    absenti: list("ABSENT"),
    puncteRich: storedRichList(m.puncteRich, m.puncte.length),
    observatiiRich: storedRich(m.observatiiRich),
    formulaRich: storedRich(m.formulaRich),
  };
}

/**
 * Persoanele care pot fi bifate ca prezente: ca în prototip, cei în evidență care nu sunt copii;
 * în plus, persoanele deja bifate (ca editarea să nu le piardă, chiar dacă între timp au ieșit).
 */
export async function attendeeOptions(ctx: Ctx, selected: string[]): Promise<ChecklistOption[]> {
  const rows = await ctx.db.person.findMany({
    where: { OR: [{ statut: { not: "COPIL" }, dataIesire: null }, { id: { in: selected } }] },
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
    select: { id: true, nume: true, prenume: true, dataIesire: true, statut: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: memberName(r),
    note: r.dataIesire ? "ieșit din evidență" : r.statut === "COPIL" ? "copil" : undefined,
  }));
}
