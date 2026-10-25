import "server-only";
import { fromDbDate } from "@/lib/dates";
import { fmtL } from "@/lib/format";
import type { Ctx } from "../session";

/**
 * A measure with the person and its minutes, for the administrators' disciplinary documents. The
 * caller must hold `disciplina` (requireCtx("disciplina")).
 */
export async function loadMeasureForPrint(ctx: Ctx, id: string) {
  const m = await ctx.db.disciplinaryMeasure.findUnique({
    where: { id },
    include: {
      person: { select: { nume: true, prenume: true, gen: true, dataNasterii: true } },
      meeting: { select: { nr: true, anRegistru: true, data: true } },
    },
  });
  if (!m) return null;
  const pv = m.meeting
    ? `${m.meeting.nr !== null ? `procesul-verbal nr. ${m.meeting.nr}/${m.meeting.anRegistru}` : "procesul-verbal"} din ${fmtL(fromDbDate(m.meeting.data)!)}`
    : "";
  return { ...m, person: { ...m.person, gen: m.person.gen as "M" | "F" | null }, pv };
}
