import { notFound } from "next/navigation";
import { printApplicationPoster } from "@/domain/print";
import { idSchema } from "@/lib/validation";
import { applicationQrPng } from "@/server/application-link";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getCampaign } from "@/server/queries/campaigns";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** The A5 poster of a campaign's general link (the same layout as the application poster). */
export async function GET(_req: Request, { params }: RouteContext<"/pdf/afis-actualizare/[id]">) {
  const ctx = await requireCtx("write");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const [c, church] = await Promise.all([getCampaign(ctx, id), getChurch(ctx)]);
  if (!c?.generalUrl) notFound();
  const pdf = await renderPdf(
    printApplicationPoster(church, c.generalUrl, await applicationQrPng(c.generalUrl, 800), {
      title: "Actualizarea datelor",
      line: "Scanați codul cu telefonul pentru a vă verifica datele din evidența bisericii.",
    }),
  );
  return pdfResponse(pdf, pdfFileName(`afis-actualizare-${church.slug}`));
}
