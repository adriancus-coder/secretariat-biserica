import { notFound } from "next/navigation";
import { fromDbDate, todayIso } from "@/lib/dates";
import { fmtL } from "@/lib/format";
import { exclusionNoticePrint } from "@/lib/discipline-print";
import { idSchema } from "@/lib/validation";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** "Informare privind excluderea" (Statut art. 27 alin. 5). Administrators only (`disciplina`). */
export async function GET(_req: Request, { params }: RouteContext<"/pdf/disciplina/[id]/informare">) {
  const ctx = await requireCtx("disciplina");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const m = await ctx.db.disciplinaryMeasure.findUnique({
    where: { id },
    include: {
      person: { select: { nume: true, prenume: true, gen: true, dataNasterii: true } },
      meeting: { select: { nr: true, anRegistru: true, data: true } },
    },
  });
  if (!m || m.forma !== "EXCLUDERE") notFound();
  const church = await getChurch(ctx);
  const pv = m.meeting ? `${m.meeting.nr !== null ? `PV nr. ${m.meeting.nr}/${m.meeting.anRegistru}` : "procesul-verbal"} din ${fmtL(fromDbDate(m.meeting.data)!)}` : "";
  const spec = exclusionNoticePrint(
    {
      person: { ...m.person, dataNasterii: fromDbDate(m.person.dataNasterii) },
      data: fromDbDate(m.dataInceput)!,
      procesVerbal: pv,
      today: todayIso(),
      comunitate: church.comunitate,
    },
    church,
  );
  return pdfResponse(await renderPdf(spec), pdfFileName(`informare-excludere-${m.person.nume}`));
}
