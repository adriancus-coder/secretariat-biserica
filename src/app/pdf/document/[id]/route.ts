import { notFound } from "next/navigation";
import { pageLayoutInput, pageLayoutSchema } from "@/lib/page-layout";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { documentFileBase, documentSpec } from "@/server/pdf/document";
import { getDocument } from "@/server/queries/documents";
import { requireCtx } from "@/server/session";

export async function GET(req: Request, { params }: RouteContext<"/pdf/document/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  // „previzualizare” e rută separată (POST); aici doar documente salvate.
  const [doc, church] = await Promise.all([getDocument(ctx, id), getChurch(ctx)]);
  if (!doc) notFound();
  // ?previzualizare=1 with the layout fields: the "Așezare în pagină" preview of unsaved changes.
  const sp = new URL(req.url).searchParams;
  const preview = sp.get("previzualizare") === "1" ? pageLayoutSchema.safeParse(pageLayoutInput(sp)) : null;
  const pdf = await renderPdf(documentSpec(doc, church, preview?.success ? preview.data : undefined));
  return pdfResponse(pdf, pdfFileName(documentFileBase(doc)));
}
