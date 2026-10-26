import "server-only";
import { fromDbDate, todayIso, toDbDate } from "@/lib/dates";
import { permissions } from "@/lib/permissions";
import { familyRelationIssues, prayerKey, prayerLabel, prayerRotation, weekStartOf, type PrayerUnit } from "@/lib/prayer";
import { prayerMessageFor } from "@/lib/prayer-message";
import type { Ctx } from "../session";

/**
 * The fields the weekly prayer reads, and nothing more: names, status and exit (who is active), the
 * birth date only to tell adults from minors and the marriage date only to tell whether the head is
 * married (never shown), the relation to the family. No contact
 * data, notes, roles or anything else (prayer.test.ts checks these selects).
 */
export const PRAYER_MEMBER_SELECT = { id: true, nume: true, prenume: true, statut: true, dataNasterii: true, dataIesire: true, rudenie: true, gen: true, dataCasatoriei: true } as const;
export const PRAYER_FAMILY_SELECT = { id: true, headId: true, prayerOptOut: true, prayerIncludeChildren: true, members: { select: PRAYER_MEMBER_SELECT } } as const;
export const PRAYER_PERSON_SELECT = { ...PRAYER_MEMBER_SELECT, prayerOptOut: true, prayerIncludeChildren: true } as const;

type Member = { id: string; nume: string; prenume: string; statut: string; dataNasterii: Date | null; dataIesire: Date | null; rudenie: string; gen: string | null; dataCasatoriei: Date | null };
export const prayerMember = (p: Member) => ({ ...p, dataNasterii: fromDbDate(p.dataNasterii), dataIesire: fromDbDate(p.dataIesire), dataCasatoriei: fromDbDate(p.dataCasatoriei) });

/** Every family and every person without a family, with the Monday of its last announcement. */
export async function loadUnits(ctx: Ctx): Promise<PrayerUnit[]> {
  const [families, singles, weeks] = await Promise.all([
    ctx.db.family.findMany({ select: PRAYER_FAMILY_SELECT }),
    ctx.db.person.findMany({ where: { familyId: null }, select: PRAYER_PERSON_SELECT }),
    ctx.db.prayerWeek.findMany({ select: { weekStart: true, familyId: true, personId: true }, orderBy: { weekStart: "asc" } }),
  ]);
  const last = new Map<string, string>();
  for (const w of weeks) {
    const key = w.familyId ? prayerKey("f", w.familyId) : w.personId ? prayerKey("p", w.personId) : null;
    if (key) last.set(key, fromDbDate(w.weekStart)!);
  }
  return [
    ...families.map((f) => ({
      key: prayerKey("f", f.id),
      headId: f.headId,
      members: f.members.map(prayerMember),
      optOut: f.prayerOptOut,
      includeChildren: f.prayerIncludeChildren,
      lastWeek: last.get(prayerKey("f", f.id)) ?? null,
    })),
    ...singles.map(({ prayerOptOut, prayerIncludeChildren, ...p }) => ({
      key: prayerKey("p", p.id),
      headId: p.id,
      members: [prayerMember(p)],
      optOut: prayerOptOut,
      includeChildren: prayerIncludeChildren,
      lastWeek: last.get(prayerKey("p", p.id)) ?? null,
    })),
  ];
}

export interface PrayerPageData {
  week: string;
  /** This week's announced family, when it was marked (its key keeps the edited message apart per family). */
  marked: { key: string; label: string } | null;
  /** The next in the rotation (after `skip` skipped ones), when the week is not marked yet. */
  next: { key: string; label: string } | null;
  /** How many units are in the rotation. */
  total: number;
  /** The last 12 weeks: date and name only. */
  history: { week: string; label: string }[];
  /**
   * The message for the shown family, built here (src/lib/prayer-message.ts): without the parents'
   * consent the children's names are not in it, and nothing else about them reaches the page.
   */
  message: string;
  /**
   * The shown family's relations need checking (familyRelationIssues): the secretariat gets the
   * family's link, the "Rugăciune" role only a plain reminder (no reason, no data). Null when fine.
   */
  review: { href: string } | { href: null } | null;
}

/**
 * The /rugaciune page: only the shown names, never a person's record. A unit that left the rotation
 * since (objection, no active adult) is shown in the history without its name.
 */
export async function loadPrayerPage(ctx: Ctx, skip: number): Promise<PrayerPageData> {
  const details = permissions.write(ctx.user);
  const today = todayIso();
  const week = weekStartOf(today);
  const [units, recent, church] = await Promise.all([
    loadUnits(ctx),
    ctx.db.prayerWeek.findMany({ select: { weekStart: true, familyId: true, personId: true }, orderBy: { weekStart: "desc" }, take: 12 }),
    ctx.db.church.findUniqueOrThrow({ where: { id: ctx.user.churchId }, select: { prayerMessage: true, prayerMessagePerson: true } }),
  ]);
  const byKey = new Map(units.map((u) => [u.key, u]));
  const shown = (familyId: string | null, personId: string | null) => {
    const u = byKey.get(familyId ? prayerKey("f", familyId) : prayerKey("p", personId ?? ""));
    if (!u) return "Familie care nu mai este în registru";
    return u.optOut ? "Familie care a cerut să nu mai fie pomenită" : prayerLabel(u, today);
  };
  const rotation = prayerRotation(units, today);
  const current = recent.find((w) => fromDbDate(w.weekStart) === week);
  const shownKey = current ? (current.familyId ? prayerKey("f", current.familyId) : prayerKey("p", current.personId ?? "")) : rotation.length ? rotation[skip % rotation.length].key : null;
  const shownUnit = shownKey ? byKey.get(shownKey) : undefined;
  // A family that objected since (or left the register) gets no message.
  const message = shownUnit && !shownUnit.optOut ? prayerMessageFor(shownUnit, today, { family: church.prayerMessage, person: church.prayerMessagePerson }) : "";
  return {
    week,
    marked: current ? { key: current.familyId ? prayerKey("f", current.familyId) : prayerKey("p", current.personId ?? ""), label: shown(current.familyId, current.personId) } : null,
    next: current || !rotation.length ? null : rotation[skip % rotation.length],
    total: rotation.length,
    history: recent.map((w) => ({ week: fromDbDate(w.weekStart)!, label: shown(w.familyId, w.personId) })),
    message,
    review:
      shownUnit && shownKey?.startsWith("f:") && familyRelationIssues(shownUnit, today).length
        ? { href: details ? `/familii/${shownKey.slice(2)}` : null }
        : null,
  };
}

/** Whether a unit is in the rotation now (marking checks it again on the server). */
export async function prayerUnitLabel(ctx: Ctx, key: string): Promise<string | null> {
  const today = todayIso();
  const hit = prayerRotation(await loadUnits(ctx), today).find((u) => u.key === key);
  return hit?.label ?? null;
}

export const thisWeek = () => toDbDate(weekStartOf(todayIso()))!;

/**
 * Setări's previews (administrators): a family of the rotation, preferably one with minor children,
 * and a person without a family. Only the fields the message uses.
 */
export async function prayerSamples(ctx: Ctx): Promise<{ family: PrayerUnit | null; person: PrayerUnit | null }> {
  const today = todayIso();
  const units = await loadUnits(ctx);
  const keys = new Set(prayerRotation(units, today).map((r) => r.key));
  const inRotation = units.filter((u) => keys.has(u.key));
  const minor = (u: PrayerUnit) => u.members.some((m) => m.dataNasterii && m.dataNasterii > `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`);
  const families = inRotation.filter((u) => u.key.startsWith("f:"));
  return {
    family: families.find(minor) ?? families[0] ?? null,
    person: inRotation.find((u) => u.key.startsWith("p:")) ?? null,
  };
}
