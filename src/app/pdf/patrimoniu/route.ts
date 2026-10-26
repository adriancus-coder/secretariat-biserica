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
  const pdf = await renderPdf(inventoryPrint(rows, today, church, { sort: sp.get("sort"), dir: sp.get("dir") }));
  return pdfResponse(pdf, pdfFileName(`inventar-${today}`));
}
