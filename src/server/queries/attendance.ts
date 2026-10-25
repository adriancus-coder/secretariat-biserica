import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AttendanceRule } from "@/lib/attendance";
import { toDbDate } from "@/lib/dates";
import type { Ctx } from "../session";

type Db = Pick<Ctx["db"], "person">;

/**
 * Persons a meeting of the given rule expects, as of the meeting date:
 * - TOTI: members in the record (statut Membru, no exit date) who had joined by that date, without
 *   an applied suspension (Statut art. 27: no vote; the list never says why someone is missing);
 * - COMITET: persons in the record holding an active committee role on that date;
 * - MANUAL: nobody.
 */
export function expectedWhere(rule: AttendanceRule, date: string): Prisma.PersonWhereInput | null {
  const day = toDbDate(date)!;
  switch (rule) {
    case "TOTI":
      return {
        statut: "MEMBRU",
        dataIesire: null,
        OR: [{ dataMembru: null }, { dataMembru: { lte: day } }],
        disciplinaryMeasures: { none: { forma: "SUSPENDARE", stare: "APLICATA" } },
      };
    case "COMITET":
      // The committee is a flag on the person (not tied to a date).
      return { dataIesire: null, statut: { not: "FOST_MEMBRU" }, inComitet: true };
    default:
      return null;
  }
}

export async function expectedAttendees(db: Db, rule: AttendanceRule, date: string): Promise<string[]> {
  const where = expectedWhere(rule, date);
  if (!where) return [];
  const rows = await db.person.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

/** The prefill lists of the meeting form, for both automatic rules. */
export async function attendancePrefill(ctx: Ctx, date: string): Promise<Record<"TOTI" | "COMITET", string[]>> {
  const [TOTI, COMITET] = await Promise.all([expectedAttendees(ctx.db, "TOTI", date), expectedAttendees(ctx.db, "COMITET", date)]);
  return { TOTI, COMITET };
}
