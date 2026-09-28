import { notFound } from "next/navigation";
import { eventPrint } from "@/domain/print";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { getEvent } from "@/server/queries/events";
import { requireCtx } from "@/server/session";

export async function GET(_req: Request, { params }: RouteContext<"/pdf/eveniment/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [e, church] = await Promise.all([getEvent(ctx, id), getChurch(ctx)]);
  if (!e) notFound();
  const pdf = await renderPdf(
    eventPrint(
      {
        titlu: e.titlu,
        data: e.data,
        ora: e.ora,
        loc: e.loc,
        invitat: e.invitat,
        responsabil: e.responsabil,
        descriere: e.descriere,
        agapaActiva: e.agapaActiva,
        agapaResponsabil: e.agapaResponsabil,
        agapaPersoane: e.agapaPersoane,
        contributii: e.contributii,
      },
      church,
    ),
  );
  return pdfResponse(pdf, pdfFileName(`${e.data}-${e.titlu}`));
}
