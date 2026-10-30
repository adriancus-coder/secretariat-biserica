import "server-only";
import { storedVotes } from "@/lib/general-assembly";
import { presentCount } from "@/lib/attendance";
import { fromDbDate, toDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { permissions } from "@/lib/permissions";
import { storedRich, storedRichList } from "@/lib/schemas/rich-text";
import type { ChecklistOption } from "@/components/person-checklist";
import type { Ctx } from "../session";
import type { Prisma } from "@/generated/prisma/client";
import { unsignedPlaces } from "@/lib/minutes-signatures";
import { getChurch } from "./church";

export const MEETINGS_PAGE_SIZE = 30;

/** The list's filters (MINUTES-IMPORT-ROBUST): every minutes, the imported ones, the imported ones with unmarked signatures. */
export const MEETING_FILTERS = ["toate", "importate", "nemarcate"] as const;
export type MeetingFilter = (typeof MEETING_FILTERS)[number];
export const MEETING_FILTER_LABEL: Record<MeetingFilter, string> = { toate: "Toate", importate: "Importate", nemarcate: "Importate · semnături nemarcate" };

const signatureState = {
  importat: true,
  locked: true,
  nrVechi: true,
  prezenti: { where: { status: "PRESENT" as const }, select: { person: { select: { id: true, nume: true, prenume: true } } } },
  signatures: { select: { personId: true } },
  roleSignatures: { select: { rol: true } },
};

/** An imported, open minutes with a place neither signed nor marked on paper. */
function unmarked(
  m: { importat: boolean; locked: boolean; prezenti: { person: { id: string; nume: string; prenume: string } }[]; signatures: { personId: string }[]; roleSignatures: { rol: string }[] },
  church: { secretar: string; pastor: string },
): boolean {
  if (!m.importat || m.locked) return false;
  return unsignedPlaces(
    m.prezenti.map((p) => p.person),
    new Set(m.signatures.map((s) => s.personId)),
    new Set(m.roleSignatures.map((r) => r.rol)),
    church,
  ).length > 0;
}

export async function listMeetings(ctx: Ctx, page: number, filter: MeetingFilter = "toate") {
  const church = await getChurch(ctx);
  let where: Prisma.MeetingWhereInput = filter === "toate" ? {} : { importat: true };
  if (filter === "nemarcate") {
    // Computed from the signatures: the imported open minutes, then those with a place unmarked.
    const open = await ctx.db.meeting.findMany({ where: { importat: true, locked: false }, select: { id: true, ...signatureState } });
    where = { id: { in: open.filter((m) => unmarked(m, church)).map((m) => m.id) } };
  }
  const total = await ctx.db.meeting.count({ where });
  const pages = Math.max(1, Math.ceil(total / MEETINGS_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await ctx.db.meeting.findMany({
    where,
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
      numarPrezenti: true,
      _count: { select: { prezenti: { where: { status: "PRESENT" } } } },
      ...signatureState,
    },
  });
  return {
    items: rows.map((m) => ({
      id: m.id,
      titlu: m.titlu,
      tip: m.tip,
      data: fromDbDate(m.data)!,
      // ATTENDANCE-COUNT: the number when recorded as one, else the persons ticked.
      prezenti: presentCount({ numarPrezenti: m.numarPrezenti, present: m._count.prezenti }),
      puncte: m.puncte.length,
      nr: m.nr,
      anRegistru: m.anRegistru,
      nrVechi: m.nrVechi,
      importat: m.importat,
      unmarked: unmarked(m, church),
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
      signatures: { select: { personId: true, signedAt: true, imagePng: true, peHartie: true, signedBy: { select: { name: true } } } },
      roleSignatures: { select: { rol: true, nume: true, signedAt: true, imagePng: true, peHartie: true, signedBy: { select: { name: true } } } },
      sourceFile: { select: { numeFisier: true, bytes: true } },
      sends: { orderBy: { sentAt: "desc" }, take: 20, include: { sentBy: { select: { name: true } } } },
    },
  });
  if (!m) return null;
  // Whether a disciplinary matter was decided in this meeting: the ordinary minutes say only that.
  const closed = await ctx.db.disciplinaryMeasure.count({ where: { OR: [{ meetingId: id, stare: { not: "CERCETARE" } }, { repunereMeetingId: id }] } });
  // MINUTES-SIGNATURES: a signature is drawn (png) or marked on paper (png null), with who marked it.
  const sig = (s: { signedAt: Date; imagePng: Uint8Array | null; peHartie: boolean; signedBy: { name: string } | null }) => ({
    signedAt: s.signedAt,
    png: s.imagePng && !s.peHartie ? Buffer.from(s.imagePng) : null,
    paper: s.peHartie,
    by: s.signedBy?.name ?? null,
  });
  const signed = new Map(m.signatures.map((s) => [s.personId, sig(s)]));
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
    roleSignatures: Object.fromEntries(m.roleSignatures.map((s) => [s.rol, { ...sig(s), nume: s.nume }])) as Partial<
      Record<"SECRETAR" | "PASTOR", ReturnType<typeof sig> & { nume: string }>
    >,
  };
}

/**
 * Persoanele care pot fi bifate ca prezente: cei în evidență care nu sunt minori (Statut art. 28: the
 * age decides, there is no "Copil" status); în plus, persoanele deja bifate (ca editarea să nu le
 * piardă, chiar dacă între timp au ieșit).
 */
export async function attendeeOptions(ctx: Ctx, selected: string[]): Promise<ChecklistOption[]> {
  // Administrators only (`disciplina`): a suspended member is marked; other roles see nothing.
  const suspended = permissions.disciplina(ctx.user)
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
