import { idSchema } from "@/lib/validation";
import { requireCtx } from "@/server/session";

/**
 * PATRIMONY-PHOTOS: a photo of a good (`?v=thumb` the 400 px thumbnail, `?v=full` the 1600 px image).
 * The same permission as /patrimoniu (`read`: Admin, Secretar, Vizualizare; never Rugăciune); the photo
 * is found through the church's scoped client, so another church's photo is a 404. Never public:
 * private cache for a day, with an ETag (a photo never changes; a new one has a new id).
 */
export async function GET(req: Request, { params }: RouteContext<"/api/patrimoniu/poze/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return new Response(null, { status: 404 });
  const full = new URL(req.url).searchParams.get("v") === "full";
  const etag = `"${id}-${full ? "full" : "thumb"}"`;
  const headers = { "Cache-Control": "private, max-age=86400", ETag: etag, "X-Content-Type-Options": "nosniff" };
  const exists = await ctx.db.assetPhoto.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return new Response(null, { status: 404 });
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const photo = await ctx.db.assetPhoto.findUnique({ where: { id }, select: full ? { data: true, mime: true } : { thumb: true, mime: true } });
  if (!photo) return new Response(null, { status: 404 });
  const body = full ? (photo as { data: Uint8Array }).data : (photo as { thumb: Uint8Array }).thumb;
  return new Response(new Uint8Array(body), { headers: { ...headers, "Content-Type": photo.mime, "Content-Length": String(body.length) } });
}
