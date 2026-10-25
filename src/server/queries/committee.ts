import "server-only";
import { ABSENCE_LIMIT, COMMITTEE_CHECK_HINT, consecutiveUnexcused, eligibilityWarnings } from "@/lib/committee";
import { fromDbDate, todayIso } from "@/lib/dates";
import { fmtL, memberName } from "@/lib/format";
import { DISCIPLINARY_FORM_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { openMeasure } from "../discipline";
import type { Ctx } from "../session";
import type { ChurchSettings } from "./church";

/**
 * The warnings next to "Membru în comitet" (Statut art. 45 alin. 4): the dates for everyone who may
 * write; an applied suspension or exclusion for administrators only. Other roles always get the
 * same reminder, whatever the person's record, so it never reveals anything.
 */
export async function committeeEligibility(ctx: Ctx, personId: string | null): Promise<string[]> {
  const admin = permissions.disciplina(ctx.user.role);
  const p = personId
    ? await ctx.db.person.findUnique({ where: { id: personId }, select: { dataMembru: true, dataBotez: true, botezAn: true } })
    : null;
  const out = p ? eligibilityWarnings({ dataMembru: fromDbDate(p.dataMembru), dataBotez: fromDbDate(p.dataBotez), botezAn: p.botezAn }, todayIso()) : [];
  if (!admin) return [...out, COMMITTEE_CHECK_HINT];
  const m = personId ? await openMeasure(ctx.db, personId) : null;
  if (m && m.stare === "APLICATA" && (m.forma === "SUSPENDARE" || m.forma === "EXCLUDERE"))
    out.push(`${DISCIPLINARY_FORM_LABEL[m.forma]} aplicată din ${fmtL(m.dataInceput)} (Statut art. 45 alin. 4).`);
  return out;
}

/**
 * Committee members with 5 or more unexcused absences in a row from the committee's meetings (types
 * with the COMITET attendance rule), newest first. Administrators only (the caller checks).
 */
export interface CommitteeAbsence {
  id: string;
  name: string;
  count: number;
  /** The meetings of the streak, newest first: id and "PV nr. 3/2026, 11.09.2026" (or the date). */
  meetings: { id: string; label: string }[];
}

export async function committeeAbsences(ctx: Ctx, church: ChurchSettings): Promise<CommitteeAbsence[]> {
  const types = Object.entries(church.attendanceRules)
    .filter(([, r]) => r === "COMITET")
    .map(([t]) => t);
  if (!types.length) return [];
  const members = await ctx.db.person.findMany({ where: { inComitet: true, dataIesire: null }, select: { id: true, nume: true, prenume: true } });
  if (!members.length) return [];
  const ids = members.map((m) => m.id);
  // The recent committee meetings with these members' rows (enough to find 5 in a row for each).
  const meetings = await ctx.db.meeting.findMany({
    where: { tip: { in: types } },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      nr: true,
      anRegistru: true,
      data: true,
      prezenti: { where: { personId: { in: ids } }, select: { personId: true, status: true, motivat: true } },
    },
  });
  const label = (x: (typeof meetings)[number]) => {
    const date = fromDbDate(x.data)!.split("-").reverse().join(".");
    return x.nr !== null ? `PV nr. ${x.nr}/${x.anRegistru}, ${date}` : date;
  };
  return members
    .map((m) => {
      const own = meetings.flatMap((x) => x.prezenti.filter((r) => r.personId === m.id).map((r) => ({ ...r, meeting: x })));
      const count = consecutiveUnexcused(own);
      return { id: m.id, name: memberName(m), count, meetings: own.slice(0, count).map((r) => ({ id: r.meeting.id, label: label(r.meeting) })) };
    })
    .filter((m) => m.count >= ABSENCE_LIMIT)
    .sort((a, b) => b.count - a.count);
}
