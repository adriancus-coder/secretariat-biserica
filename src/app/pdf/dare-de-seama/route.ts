import type { NextRequest } from "next/server";
import { reportPrint } from "@/domain/print";
import { todayIso } from "@/lib/dates";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { generateReportText } from "@/server/queries/stats";
import { requireCtx } from "@/server/session";

/**
 * Darea de seamă tipărită direct, fără înregistrare în registru — ca în prototip pentru
 * utilizatorii fără drept de scriere. Secretarii o salvează ca document (Documente → Dare de seamă).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  const an = Number(req.nextUrl.searchParams.get("an"));
  const year = Number.isInteger(an) && an > 1800 && an < 2201 ? an : Number(todayIso().slice(0, 4));
  const [text, church] = await Promise.all([generateReportText(ctx, year), getChurch(ctx)]);
  const pdf = await renderPdf(reportPrint(year, text, church));
  return pdfResponse(pdf, pdfFileName(`dare-de-seama-${year}`));
}
