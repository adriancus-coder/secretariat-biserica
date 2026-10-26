import "server-only";
import { permissions, type Who } from "@/lib/permissions";
import { tenantDb } from "../tenant-db";
import { addressReviewWhere } from "./address-review";
import { familiesToReview } from "./family-review";
import { manualLinksToReview } from "../kinship";

/**
 * Pending items per section, for the navigation badges: write roles see applications and data
 * updates to review; a pastor sees the documents waiting for their signature (on "/documente") and
 * the applications, reabilitări and excluderi proposed to them (on "/cereri").
 */
export async function pendingBadges(user: { churchId: string } & Exclude<Who, string>): Promise<Record<string, number>> {
  const db = tenantDb(user.churchId);
  const canWrite = permissions.write(user.role);
  const isPastor = permissions.pastor(user);
  const [applications, submissions, addresses, families, kinLinks, toSign, proposed, personProposals] = await Promise.all([
    canWrite ? db.application.count({ where: { status: "PENDING" } }) : 0,
    canWrite ? db.dataUpdateSubmission.count({ where: { status: "PENDING" } }) : 0,
    canWrite ? db.person.count({ where: addressReviewWhere }) : 0,
    canWrite ? familiesToReview(db).then((f) => f.length) : 0,
    canWrite ? manualLinksToReview(db).then((l) => l.length) : 0,
    isPastor ? db.document.count({ where: { stare: "DE_SEMNAT" } }) : 0,
    isPastor ? db.application.count({ where: { status: "PROPUSA" } }) : 0,
    isPastor ? db.personProposal.count({ where: { status: "PROPUSA" } }) : 0,
  ]);
  // "/cereri": the secretary's applications to prepare plus what waits for the pastor's decision.
  return { "/cereri": applications + proposed + personProposals, "/de-verificat": submissions + addresses + families + kinLinks, "/documente": toSign };
}
