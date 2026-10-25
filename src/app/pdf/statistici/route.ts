import { statisticsPrint } from "@/lib/statistics-report";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { loadStatistics } from "@/server/queries/statistics";
import { requireCtx } from "@/server/session";
import { requestedYear } from "@/lib/statistics-params";

/** The Statistici page as a PDF (charts as vectors, aggregate numbers only). All roles. */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const [d, church] = await Promise.all([loadStatistics(ctx, requestedYear(new URL(req.url).searchParams.get("an"))), getChurch(ctx)]);
  const pdf = await renderPdf(statisticsPrint(d, church));
  return pdfResponse(pdf, pdfFileName(`statistici-${d.year}`));
}
