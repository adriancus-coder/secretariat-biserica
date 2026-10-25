import "server-only";
import { permissions, type Who } from "@/lib/permissions";
import { tenantDb } from "../tenant-db";

/**
 * Pending items per section, for the navigation badges: write roles see applications and data
 * updates to review; a pastor sees the documents waiting for their signature (on "/documente").
 */
export async function pendingBadges(user: { churchId: string } & Exclude<Who, string>): Promise<Record<string, number>> {
  const db = tenantDb(user.churchId);
  const canWrite = permissions.write(user.role);
  const isPastor = permissions.pastor(user);
  const [applications, submissions, toSign] = await Promise.all([
    canWrite ? db.application.count({ where: { status: "PENDING" } }) : 0,
    canWrite ? db.dataUpdateSubmission.count({ where: { status: "PENDING" } }) : 0,
    isPastor ? db.document.count({ where: { stare: "DE_SEMNAT" } }) : 0,
  ]);
  return { "/cereri": applications, "/de-verificat": submissions, "/documente": toSign };
}
