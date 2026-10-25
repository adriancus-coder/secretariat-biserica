import { notFound } from "next/navigation";
import { pageLayoutInput, pageLayoutSchema } from "@/lib/page-layout";
import { docxResponse, renderDocx } from "@/server/docx/render";
import { documentFileBase, documentSpec } from "@/server/pdf/document";
import { pdfFileName } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { getDocument } from "@/server/queries/documents";
import { requireCtx } from "@/server/session";
import { printSignatures } from "@/server/document-signatures";

/** The registered document as an editable Word file: letterhead, number, date, body and signatures. */
export async function GET(req: Request, { params }: RouteContext<"/pdf/document/[id]/word">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [doc, church] = await Promise.all([getDocument(ctx, id), getChurch(ctx)]);
  if (!doc) notFound();
  const sp = new URL(req.url).searchParams;
  const preview = sp.get("previzualizare") === "1" ? pageLayoutSchema.safeParse(pageLayoutInput(sp)) : null;
  const docx = await renderDocx(documentSpec({ ...doc, signatures: await printSignatures(doc.id) }, church, preview?.success ? preview.data : undefined));
  return docxResponse(docx, pdfFileName(documentFileBase(doc)).replace(/\.pdf$/, ".docx"));
}
