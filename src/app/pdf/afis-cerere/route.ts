import { printApplicationPoster } from "@/domain/print";
import { applicationQrPng, applicationUrl } from "@/server/application-link";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** "Afiș PDF": an A5 poster with the church name, the QR code and the link of the public application. */
export async function GET() {
  const ctx = await requireCtx("write");
  const church = await getChurch(ctx);
  const url = await applicationUrl(church.slug);
  const pdf = await renderPdf(printApplicationPoster(church, url, await applicationQrPng(url, 800)));
  return pdfResponse(pdf, pdfFileName(`afis-cerere-${church.slug}`));
}
