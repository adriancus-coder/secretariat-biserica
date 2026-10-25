import { notFound } from "next/navigation";
import { pageLayoutInput, pageLayoutSchema } from "@/lib/page-layout";
import { docxResponse } from "@/server/docx/render";
import { meetingPdfFileName, renderMeetingDocx } from "@/server/pdf/meeting";
import { getChurch } from "@/server/queries/church";
import { getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

/** "Deschide în Word": the minutes as an editable .docx (same content as the PDF). */
export async function GET(req: Request, { params }: RouteContext<"/pdf/proces-verbal/[id]/word">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [m, church] = await Promise.all([getMeeting(ctx, id), getChurch(ctx)]);
  if (!m) notFound();
  // ?previzualizare=1 with the layout fields: the unsaved layout of "Așezare în pagină".
  const sp = new URL(req.url).searchParams;
  const preview = sp.get("previzualizare") === "1" ? pageLayoutSchema.safeParse(pageLayoutInput(sp)) : null;
  return docxResponse(await renderMeetingDocx(m, church, preview?.success ? preview.data : undefined), meetingPdfFileName(m, church.slug).replace(/\.pdf$/, ".docx"));
}
