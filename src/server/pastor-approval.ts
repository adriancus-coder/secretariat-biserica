import "server-only";
import { prisma } from "./db";

/**
 * The pastor's approval applies once the church has an active user marked as pastor (Setări →
 * Utilizatori). Without one, documents are issued as before and applications are accepted directly
 * by the secretary; a document or application waiting for a pastor counts as approved.
 */
export async function hasActivePastor(churchId: string): Promise<boolean> {
  return (await prisma.user.count({ where: { churchId, isPastor: true, active: true } })) > 0;
}
