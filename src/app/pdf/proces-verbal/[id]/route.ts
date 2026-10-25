import { notFound } from "next/navigation";
import { pageLayoutInput, pageLayoutSchema } from "@/lib/page-layout";
import { meetingPdfFileName, renderMeetingPdf } from "@/server/pdf/meeting";
import { pdfResponse } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

export async function GET(req: Request, { params }: RouteContext<"/pdf/proces-verbal/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [m, church] = await Promise.all([getMeeting(ctx, id), getChurch(ctx)]);
  if (!m) notFound();
  // ?previzualizare=1 with the layout fields: the "Așezare în pagină" preview of unsaved changes.
  const sp = new URL(req.url).searchParams;
  const preview = sp.get("previzualizare") === "1" ? pageLayoutSchema.safeParse(pageLayoutInput(sp)) : null;
  const pdf = await renderMeetingPdf(m, church, preview?.success ? preview.data : undefined);
  // ?descarca=1 asks for a download (the share button's fallback).
  const download = sp.get("descarca") === "1";
  return pdfResponse(pdf, meetingPdfFileName(m, church.slug), download);
}
