import { notFound } from "next/navigation";
import { groupPrint } from "@/domain/print";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { getGroup } from "@/server/queries/groups-notes";
import { requireCtx } from "@/server/session";

export async function GET(_req: Request, { params }: RouteContext<"/pdf/grup/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [g, church] = await Promise.all([getGroup(ctx, id), getChurch(ctx)]);
  if (!g) notFound();
  const pdf = await renderPdf(groupPrint({ nume: g.nume, responsabil: g.responsabil, membri: g.membri }, church));
  return pdfResponse(pdf, pdfFileName(`grup-${g.nume}`));
}
