import { notFound } from "next/navigation";
import { docxResponse, renderDocx } from "@/server/docx/render";
import { documentFileBase, documentSpec } from "@/server/pdf/document";
import { pdfFileName } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { getDocument } from "@/server/queries/documents";
import { requireCtx } from "@/server/session";

/** The registered document as an editable Word file: letterhead, number, date, body and signatures. */
export async function GET(_req: Request, { params }: RouteContext<"/pdf/document/[id]/word">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [doc, church] = await Promise.all([getDocument(ctx, id), getChurch(ctx)]);
  if (!doc) notFound();
  const docx = await renderDocx(documentSpec(doc, church));
  return docxResponse(docx, pdfFileName(documentFileBase(doc)).replace(/\.pdf$/, ".docx"));
}
