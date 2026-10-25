import { notFound } from "next/navigation";
import { docxResponse } from "@/server/docx/render";
import { meetingPdfFileName, renderMeetingDocx } from "@/server/pdf/meeting";
import { getChurch } from "@/server/queries/church";
import { getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

/** "Deschide în Word": the minutes as an editable .docx (same content as the PDF). */
export async function GET(_req: Request, { params }: RouteContext<"/pdf/proces-verbal/[id]/word">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [m, church] = await Promise.all([getMeeting(ctx, id), getChurch(ctx)]);
  if (!m) notFound();
  return docxResponse(await renderMeetingDocx(m, church), meetingPdfFileName(m, church.slug).replace(/\.pdf$/, ".docx"));
}
