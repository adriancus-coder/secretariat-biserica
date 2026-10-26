import { neamPrint } from "@/lib/kinship-report";
import { loadKinship } from "@/server/kinship";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** Statistici → Neamuri as a PDF (the screen's sort). Every role that reads the register; not "Rugăciune". */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const [kin, church] = await Promise.all([loadKinship(ctx.db), getChurch(ctx)]);
  const pdf = await renderPdf(neamPrint(kin.neamuri, church, { sort: sp.get("sort"), dir: sp.get("dir") }));
  return pdfResponse(pdf, pdfFileName("neamuri"));
}
