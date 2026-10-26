import "server-only";
import { mandateNotice } from "@/lib/committee";
import { appTimeZone, fromDbDate, todayIso, toDbDate } from "@/lib/dates";
import { weekStartOf } from "@/lib/prayer";
import { isGeneralAssembly, ordinaryAssemblyMissing } from "@/lib/general-assembly";
import { prisma } from "./db";
import { logError } from "./log";
import { isPushConfigured, notifyChurch } from "./push";
import { tenantDb } from "./tenant-db";

const DAY = 24 * 3600_000;

/** The hour (0–23) in the app's time zone. */
function localHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: appTimeZone(), hour: "2-digit", hourCycle: "h23" }).format(now));
}

/**
 * The digests, run every 15 minutes by src/instrumentation.ts: once a day "new campaign answers to
 * check" to write roles (only when some arrived since the last digest), once a week the General
 * Assembly / committee mandate reminder (only when Acasă would show one), on Monday morning "the family
 * of the week is ready" to the users with the `rugaciune` permission. Each church's run is
 * claimed by moving its timestamp first, so a restart or a second instance never sends it twice.
 */
export async function runPushDigests(now = new Date()): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    const churches = await prisma.church.findMany({
      where: { users: { some: { active: true, pushSubscriptions: { some: {} } } } },
      select: { id: true, pushDailyAt: true, pushWeeklyAt: true, pushPrayerWeek: true, comitetAlesLa: true, comitetPrelungit: true, tipuriAG: true },
    });
    const today = todayIso();
    const monday = weekStartOf(today);
    // Monday from 08:00 (the church's time zone): "Familia săptămânii este pregătită." once per week.
    const prayerTime = today === monday && localHour(now) >= 8;
    for (const c of churches) {
      const db = tenantDb(c.id);
      if (prayerTime && fromDbDate(c.pushPrayerWeek) !== monday) {
        const claim = await prisma.church.updateMany({ where: { id: c.id, pushPrayerWeek: c.pushPrayerWeek }, data: { pushPrayerWeek: toDbDate(monday) } });
        if (claim.count === 1) await notifyChurch(c.id, "PRAYER");
      }
      if (!c.pushDailyAt || now.getTime() - c.pushDailyAt.getTime() >= DAY) {
        const claim = await prisma.church.updateMany({ where: { id: c.id, pushDailyAt: c.pushDailyAt }, data: { pushDailyAt: now } });
        const since = c.pushDailyAt ?? new Date(now.getTime() - DAY);
        if (claim.count === 1 && (await db.dataUpdateSubmission.count({ where: { status: "PENDING", createdAt: { gt: since } } }))) await notifyChurch(c.id, "CAMPAIGN");
      }
      if (!c.pushWeeklyAt || now.getTime() - c.pushWeeklyAt.getTime() >= 7 * DAY) {
        const claim = await prisma.church.updateMany({ where: { id: c.id, pushWeeklyAt: c.pushWeeklyAt }, data: { pushWeeklyAt: now } });
        if (claim.count !== 1) continue;
        const y = today.slice(0, 4);
        const held = await db.meeting.findMany({
          where: { data: { gte: toDbDate(`${y}-01-01`)!, lte: toDbDate(today)! }, OR: [{ tipAG: null }, { tipAG: "ORDINARA" }] },
          select: { tip: true },
        });
        const mandate = mandateNotice(today, c.comitetAlesLa ? c.comitetAlesLa.toISOString().slice(0, 10) : null, c.comitetPrelungit);
        if (mandate || ordinaryAssemblyMissing(today, held.filter((m) => isGeneralAssembly(m.tip, c.tipuriAG)).length)) await notifyChurch(c.id, "REMINDER");
      }
    }
  } catch (e) {
    logError("push-digests", e);
  }
}
