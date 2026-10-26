import { consentFormPrint } from "@/lib/consent-form-print";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** "Formular pe hârtie": the blank consents form, with the weekly prayer rows (write roles). */
export async function GET() {
  const ctx = await requireCtx("write");
  const pdf = await renderPdf(consentFormPrint(await getChurch(ctx)));
  return pdfResponse(pdf, pdfFileName("formular-acorduri"));
}
