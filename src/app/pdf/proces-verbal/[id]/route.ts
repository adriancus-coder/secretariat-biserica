import { notFound } from "next/navigation";
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
  const pdf = await renderMeetingPdf(m, church);
  // ?descarca=1 asks for a download (the share button's fallback).
  const download = new URL(req.url).searchParams.get("descarca") === "1";
  return pdfResponse(pdf, meetingPdfFileName(m, church.slug), download);
}
