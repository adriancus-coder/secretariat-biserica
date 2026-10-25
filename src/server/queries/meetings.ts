import { storedVotes } from "@/lib/general-assembly";
import "server-only";
import { fromDbDate, toDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { permissions } from "@/lib/permissions";
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
  // Whether a disciplinary matter was decided in this meeting: the ordinary minutes say only that.
  const closed = await ctx.db.disciplinaryMeasure.count({ where: { OR: [{ meetingId: id, stare: { not: "CERCETARE" } }, { repunereMeetingId: id }] } });
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
        motivat: p.motivat,
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
    convocatLa: fromDbDate(m.convocatLa),
    voturi: storedVotes(m.voturi),
    sedintaInchisa: closed > 0,
  };
}

/**
 * Persoanele care pot fi bifate ca prezente: cei în evidență care nu sunt minori (Statut art. 28: the
 * age decides, there is no "Copil" status); în plus, persoanele deja bifate (ca editarea să nu le
 * piardă, chiar dacă între timp au ieșit).
 */
export async function attendeeOptions(ctx: Ctx, selected: string[]): Promise<ChecklistOption[]> {
  // Administrators only (`disciplina`): a suspended member is marked; other roles see nothing.
  const suspended = permissions.disciplina(ctx.user.role)
    ? new Set(
        (await ctx.db.disciplinaryMeasure.findMany({ where: { forma: "SUSPENDARE", stare: "APLICATA" }, select: { personId: true } })).map((m) => m.personId),
      )
    : new Set<string>();
  const today = todayIso();
  const adultBorn = toDbDate(`${Number(today.slice(0, 4)) - 18}${today.slice(4)}`)!;
  const rows = await ctx.db.person.findMany({
    where: { OR: [{ dataIesire: null, OR: [{ dataNasterii: null }, { dataNasterii: { lte: adultBorn } }] }, { id: { in: selected } }] },
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
    select: { id: true, nume: true, prenume: true, dataIesire: true, dataNasterii: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: memberName(r),
    note: r.dataIesire
      ? "ieșit din evidență"
      : suspended.has(r.id)
        ? "suspendat — fără drept de vot"
        : r.dataNasterii && r.dataNasterii > adultBorn
          ? "minor"
          : undefined,
  }));
}

export interface MeetingChoice {
  id: string;
  label: string;
  data: string;
}

/** The minutes, newest first, for linking a person's entry or exclusion (Statut art. 22–24). */
export async function meetingChoices(ctx: Ctx): Promise<MeetingChoice[]> {
  const rows = await ctx.db.meeting.findMany({
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: { id: true, nr: true, anRegistru: true, tip: true, titlu: true, data: true },
  });
  return rows.map((m) => {
    const data = fromDbDate(m.data)!;
    const nr = m.nr !== null ? `PV nr. ${m.nr}/${m.anRegistru} — ` : "";
    return { id: m.id, data, label: `${nr}${m.titlu || m.tip}, ${data.split("-").reverse().join(".")}` };
  });
}
