import { notFound } from "next/navigation";
import { meetingPrint } from "@/domain/print";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

export async function GET(_req: Request, { params }: RouteContext<"/pdf/proces-verbal/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [m, church] = await Promise.all([getMeeting(ctx, id), getChurch(ctx)]);
  if (!m) notFound();
  const pdf = await renderPdf(
    meetingPrint(
      {
        titlu: m.titlu,
        tip: m.tip,
        data: m.data,
        ora: m.ora,
        loc: m.loc,
        presedinte: m.presedinte,
        invitati: m.invitati,
        ordine: m.ordine,
        discutii: m.discutii,
        hotarari: m.hotarari,
        prezenti: m.prezenti.map((p) => p.name),
      },
      church,
    ),
  );
  return pdfResponse(pdf, pdfFileName(`proces-verbal-${m.data}-${m.titlu || m.tip}`));
}
