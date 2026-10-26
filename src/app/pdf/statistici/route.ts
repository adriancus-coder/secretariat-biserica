import { statisticsPrint } from "@/lib/statistics-report";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { loadStatistics } from "@/server/queries/statistics";
import { requireCtx } from "@/server/session";
import { requestedYear } from "@/lib/statistics-params";

/** The Statistici page as a PDF (charts as vectors, aggregate numbers only; tables in the screen's sort). All roles. */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const [d, church] = await Promise.all([loadStatistics(ctx, requestedYear(sp.get("an"))), getChurch(ctx)]);
  // The tables in the order the page shows them (?sort=<table>.<column>&dir=).
  const pdf = await renderPdf(statisticsPrint(d, church, { sort: sp.get("sort"), dir: sp.get("dir") }));
  return pdfResponse(pdf, pdfFileName(`statistici-${d.year}`));
}
