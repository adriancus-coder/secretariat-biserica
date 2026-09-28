import { notFound } from "next/navigation";
import { documentPrint } from "@/domain/print";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { getDocument } from "@/server/queries/documents";
import { requireCtx } from "@/server/session";

export async function GET(_req: Request, { params }: RouteContext<"/pdf/document/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  // „previzualizare” e rută separată (POST); aici doar documente salvate.
  const [doc, church] = await Promise.all([getDocument(ctx, id), getChurch(ctx)]);
  if (!doc) notFound();
  const pdf = await renderPdf(documentPrint({ tip: doc.tip, nr: doc.nr, data: doc.data, text: doc.text, titlu: doc.titlu }, church));
  return pdfResponse(pdf, pdfFileName(`${doc.titlu || doc.tip}-nr-${doc.nr}-${doc.anRegistru}`));
}
