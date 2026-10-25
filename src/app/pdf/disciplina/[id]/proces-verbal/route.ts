import { notFound } from "next/navigation";
import { disciplinaryMinutesPrint } from "@/lib/discipline-print";
import { DISCIPLINARY_FORM_LABEL } from "@/lib/labels";
import { idSchema } from "@/lib/validation";
import { loadMeasureForPrint } from "@/server/pdf/discipline";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/**
 * "PV disciplinar" (Statut art. 272 lit. c): the closed-session part of the committee minutes. Only
 * here, for administrators (`disciplina`); the ordinary minutes say "Punct tratat în ședință închisă".
 */
export async function GET(_req: Request, { params }: RouteContext<"/pdf/disciplina/[id]/proces-verbal">) {
  const ctx = await requireCtx("disciplina");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const m = await loadMeasureForPrint(ctx, id);
  if (!m || m.stare === "CERCETARE" || !m.meetingId) notFound();
  const church = await getChurch(ctx);
  const spec = disciplinaryMinutesPrint(
    {
      person: m.person,
      sedinta: m.pv,
      abatere: m.abatere,
      raspuns: m.raspuns,
      nuSaPrezentat: m.nuSaPrezentat,
      sanctiune: DISCIPLINARY_FORM_LABEL[m.forma],
      incadrare: m.incadrare,
      temei: m.temei,
      comunitate: church.comunitate,
    },
    church,
  );
  return pdfResponse(await renderPdf(spec), pdfFileName(`pv-disciplinar-${m.person.nume}`));
}
