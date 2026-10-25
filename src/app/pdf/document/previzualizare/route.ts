import { z } from "zod";
import { documentPrint } from "@/domain/print";
import { DRAFT_WATERMARK } from "@/server/pdf/document";
import { DOCUMENT_TYPES } from "@/lib/labels";
import { richField } from "@/lib/schemas/rich-text";
import { resolveLayout } from "@/lib/page-layout";
import { idSchema, longText, optionalInt, requiredDate, requiredEnum } from "@/lib/validation";
import { pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

const previewSchema = z.object({
  tip: requiredEnum(DOCUMENT_TYPES),
  nr: optionalInt(1, 999999),
  data: requiredDate(),
  text: longText(100000),
  textRich: richField,
});

/** Previzualizarea PDF a documentului din formular, fără salvare (ca butonul „Previzualizare” din prototip). */
export async function POST(req: Request) {
  const ctx = await requireCtx("write");
  const form = await req.formData();
  const parsed = previewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return new Response("Date incomplete pentru previzualizare: completați tipul, data și conținutul.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const church = await getChurch(ctx);
  const { tip, nr, data, text, textRich } = parsed.data;
  // An existing document keeps its own page layout in the preview; a new one gets the church's default.
  const previewId = idSchema.safeParse(form.get("previewId"));
  const existing = previewId.success ? await ctx.db.document.findUnique({ where: { id: previewId.data }, select: { layout: true } }) : null;
  const spec = documentPrint({ tip, nr: nr ?? "____", data, text, textRich, watermark: DRAFT_WATERMARK }, church);
  const pdf = await renderPdf({ ...spec, layout: resolveLayout(church.docLayout, existing?.layout) });
  return pdfResponse(pdf, "previzualizare.pdf");
}
