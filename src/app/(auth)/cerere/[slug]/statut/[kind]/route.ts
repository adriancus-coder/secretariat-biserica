import { ipFromHeaders } from "@/lib/client-ip";
import { isValidSlug } from "@/lib/slug";
import { statuteKindFromSlug } from "@/lib/statutes";
import { prisma } from "@/server/db";
import { pdfFileName, pdfResponse } from "@/server/pdf/render";
import { sharedRateLimiter } from "@/server/rate-limit";

/** Public documents: 60 downloads per hour per address is plenty for reading a statute. */
const statuteLimiter = () => sharedRateLimiter("statute", { limit: 60, windowMs: 60 * 60 * 1000 });

/**
 * Public: a statute published by the church, shown inline (linked from its application form). Cached
 * for an hour (it is public), with an ETag from the upload time so a replaced statute is fetched again.
 */
export async function GET(req: Request, { params }: RouteContext<"/cerere/[slug]/statut/[kind]">) {
  const { slug, kind: kindSlug } = await params;
  const kind = statuteKindFromSlug(kindSlug);
  if (!kind || !isValidSlug(slug)) return new Response("Documentul nu există.", { status: 404 });
  const ip = ipFromHeaders((n) => req.headers.get(n), process.env.AUTH_TRUST_HOST === "true");
  if (!statuteLimiter().hit(`${ip}|${slug}`)) {
    return new Response("Prea multe cereri. Încercați din nou mai târziu.", { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "3600" } });
  }
  const church = await prisma.church.findUnique({ where: { slug }, select: { id: true } });
  const meta = church
    ? await prisma.churchDocument.findUnique({ where: { churchId_kind: { churchId: church.id, kind } }, select: { id: true, uploadedAt: true } })
    : null;
  if (!meta) return new Response("Documentul nu există.", { status: 404 });
  const etag = `"${meta.id}-${meta.uploadedAt.getTime()}"`;
  const cache = { "Cache-Control": "public, max-age=3600", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cache });
  const doc = await prisma.churchDocument.findUniqueOrThrow({ where: { id: meta.id }, select: { fileName: true, pdf: true } });
  // Header values must be ASCII: the name is transliterated (pdfFileName).
  return pdfResponse(Buffer.from(doc.pdf), pdfFileName(doc.fileName.replace(/\.pdf$/i, "")), false, cache);
}
