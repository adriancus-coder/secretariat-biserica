import { todayIso } from "@/lib/dates";
import { inventoryPrint } from "@/lib/patrimony";
import { exportAssets } from "@/server/assets-export";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** „Inventarul bunurilor la <data>” (Statut art. 43 alin. 7), with the pastor's and the secretary's signatures. Every role that reads the register. */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const today = todayIso();
  const [rows, church] = await Promise.all([exportAssets(ctx, sp), getChurch(ctx)]);
  // „Cu poze” (`poze=1`): the thumbnail of each good's main photo; by default without photos.
  const withPhotos = sp.get("poze") === "1";
  const ids = rows.map((r) => r.photoId).filter((x): x is string => Boolean(x));
  const photos = withPhotos ? new Map((await ctx.db.assetPhoto.findMany({ where: { id: { in: ids } }, select: { id: true, thumb: true } })).map((p) => [p.id, new Uint8Array(p.thumb)])) : undefined;
  const pdf = await renderPdf(inventoryPrint(rows, today, church, { sort: sp.get("sort"), dir: sp.get("dir") }, photos));
  return pdfResponse(pdf, pdfFileName(`inventar-${today}${withPhotos ? "-cu-poze" : ""}`));
}
