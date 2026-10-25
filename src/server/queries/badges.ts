import "server-only";
import { tenantDb } from "../tenant-db";

/** Pending items per section, for the navigation badges (write roles only). */
export async function pendingBadges(churchId: string): Promise<Record<string, number>> {
  const db = tenantDb(churchId);
  const [applications, submissions] = await Promise.all([
    db.application.count({ where: { status: "PENDING" } }),
    db.dataUpdateSubmission.count({ where: { status: "PENDING" } }),
  ]);
  return { "/cereri": applications, "/de-verificat": submissions };
}
