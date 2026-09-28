import { z } from "zod";
import { documentPrint } from "@/domain/print";
import { DOCUMENT_TYPES } from "@/lib/labels";
import { longText, optionalInt, requiredDate, requiredEnum } from "@/lib/validation";
import { pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

const previewSchema = z.object({
  tip: requiredEnum(DOCUMENT_TYPES),
  nr: optionalInt(1, 999999),
  data: requiredDate(),
  text: longText(100000),
});

/** Previzualizarea PDF a documentului din formular, fără salvare (ca butonul „Previzualizare” din prototip). */
export async function POST(req: Request) {
  const ctx = await requireCtx("write");
  const parsed = previewSchema.safeParse(Object.fromEntries(await req.formData()));
  if (!parsed.success) {
    return new Response("Date incomplete pentru previzualizare: completați tipul, data și conținutul.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const church = await getChurch(ctx);
  const { tip, nr, data, text } = parsed.data;
  const pdf = await renderPdf(documentPrint({ tip, nr: nr ?? "____", data, text }, church));
  return pdfResponse(pdf, "previzualizare.pdf");
}
