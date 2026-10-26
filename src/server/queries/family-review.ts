import "server-only";
import { todayIso } from "@/lib/dates";
import { familyRelationIssues, prayerKey } from "@/lib/prayer";
import type { TenantClient } from "../tenant-db";
import { PRAYER_MEMBER_SELECT, prayerMember } from "./prayer";

export const FAMILY_REVIEW_TITLE = "Familii cu rudenii de verificat";

/**
 * Families whose relations make the weekly prayer's message unreliable (a member without a relation,
 * a married adult "Fiică", a spouse under 18, a married head without a spouse, two spouses), with the
 * reasons. Write roles only (De verificat and its badge); nothing is changed automatically.
 */
export async function familiesToReview(db: TenantClient): Promise<{ id: string; nume: string; reasons: string[] }[]> {
  const today = todayIso();
  const families = await db.family.findMany({ select: { id: true, nume: true, headId: true, members: { select: PRAYER_MEMBER_SELECT } }, orderBy: { nume: "asc" } });
  return families
    .map((f) => ({
      id: f.id,
      nume: f.nume,
      reasons: familyRelationIssues({ key: prayerKey("f", f.id), headId: f.headId, members: f.members.map(prayerMember), optOut: false, includeChildren: false, lastWeek: null }, today),
    }))
    .filter((f) => f.reasons.length);
}
