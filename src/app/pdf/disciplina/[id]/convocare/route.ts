import { notFound, redirect } from "next/navigation";
import { hasStepUp } from "@/server/step-up";
import { fromDbDate, todayIso } from "@/lib/dates";
import { hearingConvocationPrint } from "@/lib/discipline-print";
import { idSchema } from "@/lib/validation";
import { loadMeasureForPrint } from "@/server/pdf/discipline";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** "Convocare la audiere" (Statut art. 272 lit. a). Administrators only (`disciplina`). */
export async function GET(_req: Request, { params }: RouteContext<"/pdf/disciplina/[id]/convocare">) {
  const ctx = await requireCtx("disciplina");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const m = await loadMeasureForPrint(ctx, id);
  if (!m || !m.audiereLa) notFound();
  if (!(await hasStepUp(ctx.user))) redirect(`/persoane/${m.personId}/disciplina`);
  const church = await getChurch(ctx);
  const spec = hearingConvocationPrint(
    { person: m.person, data: fromDbDate(m.audiereLa)!, ora: m.audiereOra, loc: m.audiereLoc, today: todayIso(), adresa: church.adresa },
    church,
  );
  return pdfResponse(await renderPdf(spec), pdfFileName(`convocare-audiere-${m.person.nume}`));
}
