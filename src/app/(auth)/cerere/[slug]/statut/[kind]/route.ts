import { isValidSlug } from "@/lib/slug";
import { statuteKindFromSlug } from "@/lib/statutes";
import { prisma } from "@/server/db";
import { pdfFileName, pdfResponse } from "@/server/pdf/render";

/** Public: a statute published by the church, shown inline (linked from its application form). */
export async function GET(_req: Request, { params }: RouteContext<"/cerere/[slug]/statut/[kind]">) {
  const { slug, kind: kindSlug } = await params;
  const kind = statuteKindFromSlug(kindSlug);
  if (!kind || !isValidSlug(slug)) return new Response("Documentul nu există.", { status: 404 });
  const church = await prisma.church.findUnique({ where: { slug }, select: { id: true } });
  const doc = church
    ? await prisma.churchDocument.findUnique({ where: { churchId_kind: { churchId: church.id, kind } }, select: { fileName: true, pdf: true } })
    : null;
  if (!doc) return new Response("Documentul nu există.", { status: 404 });
  // Header values must be ASCII: the name is transliterated (pdfFileName).
  return pdfResponse(Buffer.from(doc.pdf), pdfFileName(doc.fileName.replace(/\.pdf$/i, "")));
}
