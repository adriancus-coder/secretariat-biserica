import "server-only";
import { STATUTE_KINDS, type StatuteKind } from "@/lib/statutes";
import { prisma } from "./db";

export interface StatuteInfo {
  kind: StatuteKind;
  fileName: string;
  size: number;
  uploadedAt: Date;
}

/**
 * The statutes a church has published, without the PDF bytes. Uses the global client: it also
 * serves the public application form, where the church comes from its slug.
 */
export async function listStatutes(churchId: string): Promise<StatuteInfo[]> {
  const rows = await prisma.churchDocument.findMany({
    where: { churchId, kind: { in: [...STATUTE_KINDS] } },
    select: { kind: true, fileName: true, size: true, uploadedAt: true },
  });
  return STATUTE_KINDS.flatMap((k) => rows.filter((r) => r.kind === k));
}
