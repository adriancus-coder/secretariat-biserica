import { parseStoredBlocks } from "@/lib/generated-blocks";
import { GENERATED, isGeneratedKind, kindParams } from "@/lib/generated-kinds";
import { pageLayoutInput, pageLayoutSchema } from "@/lib/page-layout";
import { applyStored, loadSource } from "@/server/generated";
import { pdfResponse, renderPdf } from "@/server/pdf/render";
import { requireCtx } from "@/server/session";
import { hasStepUp } from "@/server/step-up";

const text = (message: string, status: number) => new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * GENERATED-EDIT: the PDF of the editor's unsaved content (nothing is stored). The source's permission
 * (and the step-up for disciplinary data), the blocks checked like on save.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const kind = form.get("sursa");
  if (!isGeneratedKind(kind)) return text("Documentul nu există.", 404);
  const meta = GENERATED[kind];
  const ctx = await requireCtx(meta.permission);
  if (meta.discipline && !(await hasStepUp(ctx.user))) return text("Confirmați identitatea, apoi încercați din nou.", 403);
  const src = await loadSource(ctx, kind, kindParams(kind, new URLSearchParams(String(form.get("parametri") ?? ""))));
  if (!src) return text("Documentul nu mai există.", 404);
  const blocks = parseStoredBlocks(String(form.get("blocks") ?? ""));
  if (!blocks.ok) return text(blocks.message, 400);
  const layout = form.get("asezareProprie") === "on" ? pageLayoutSchema.safeParse(pageLayoutInput(form)) : null;
  if (layout && !layout.success) return text("Așezarea în pagină nu este completă.", 400);
  return pdfResponse(await renderPdf(applyStored(src.spec, blocks.blocks, layout?.data ?? null)), "previzualizare.pdf");
}
