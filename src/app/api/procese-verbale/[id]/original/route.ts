import { notFound } from "next/navigation";
import { idSchema } from "@/lib/validation";
import { requireCtx } from "@/server/session";

/**
 * MINUTES-IMPORT-ROBUST: the Word file an imported minutes was read from, as it was uploaded (the
 * minutes' readers may download it; found through the church-scoped client, so another church's is 404).
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/procese-verbale/[id]/original">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const ctx = await requireCtx();
  const file = await ctx.db.meetingSourceFile.findFirst({ where: { meetingId: id }, select: { numeFisier: true, mime: true, data: true } });
  if (!file) notFound();
  const name = file.numeFisier.replace(/["\\\r\n]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
