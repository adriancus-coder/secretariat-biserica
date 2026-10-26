import { registerPrint } from "@/lib/correspondence";
import { exportRegister } from "@/server/correspondence-export";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** „Registru de intrare-ieșire <an>” as a PDF (the page's year, filter, search and sort). Every role that reads the register. */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const [{ an, rows }, church] = await Promise.all([exportRegister(ctx, sp), getChurch(ctx)]);
  const pdf = await renderPdf(registerPrint(rows, an, church, { sort: sp.get("sort"), dir: sp.get("dir") }));
  return pdfResponse(pdf, pdfFileName(`registru-intrare-iesire-${an}`));
}
