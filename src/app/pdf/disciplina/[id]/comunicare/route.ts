import { notFound, redirect } from "next/navigation";
import { hasStepUp } from "@/server/step-up";
import { fromDbDate, todayIso } from "@/lib/dates";
import { sanctionNoticePrint } from "@/lib/discipline-print";
import { DISCIPLINARY_FORM_LABEL } from "@/lib/labels";
import { idSchema } from "@/lib/validation";
import { loadMeasureForPrint } from "@/server/pdf/discipline";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/**
 * "Comunicarea sancțiunii" (Statut art. 27 alin. 10) with the appeal deadline: the communication date
 * + 15 days (today when not recorded yet). Administrators only (`disciplina`).
 */
export async function GET(_req: Request, { params }: RouteContext<"/pdf/disciplina/[id]/comunicare">) {
  const ctx = await requireCtx("disciplina");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const m = await loadMeasureForPrint(ctx, id);
  if (!m || m.stare !== "APLICATA") notFound();
  if (!(await hasStepUp(ctx.user))) redirect(`/persoane/${m.personId}/disciplina`);
  const church = await getChurch(ctx);
  const spec = sanctionNoticePrint(
    {
      person: m.person,
      sanctiune: DISCIPLINARY_FORM_LABEL[m.forma],
      sedinta: m.pv,
      temei: m.temei,
      comunicatLa: fromDbDate(m.comunicatLa) ?? todayIso(),
      comunitate: church.comunitate,
    },
    church,
  );
  return pdfResponse(await renderPdf(spec), pdfFileName(`comunicare-sanctiune-${m.person.nume}`));
}
