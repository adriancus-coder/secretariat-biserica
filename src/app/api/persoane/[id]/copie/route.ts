import { notFound } from "next/navigation";
import { dataCopyJson, dataCopyPrint } from "@/lib/data-copy";
import { permissions } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "@/server/audit";
import { loadDataCopy } from "@/server/data-copy";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/**
 * "Copie a datelor (art. 15 GDPR)": a person's data as PDF or JSON. Administrators only; each copy
 * writes a SECURITY audit entry with the format (never the content).
 */
export async function GET(req: Request, { params }: RouteContext<"/api/persoane/[id]/copie">) {
  const ctx = await requireCtx("admin");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") === "json" ? "json" : "pdf";
  const withDiscipline = sp.get("disciplina") === "1" && permissions.disciplina(ctx.user);
  const copy = await loadDataCopy(ctx, id, withDiscipline);
  if (!copy) notFound();
  await ctx.db.$transaction((tx) =>
    writeAudit(tx, ctx.user, {
      entity: "SECURITY",
      entityId: id,
      entityLabel: `Copie a datelor: ${copy.persoana}`,
      action: "CREATE",
      fields: [],
      extra: { format },
    }),
  );
  const name = pdfFileName(`copie-date-${copy.persoana}`);
  if (format === "json") {
    return new Response(JSON.stringify(dataCopyJson(copy), null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name.replace(/\.pdf$/, ".json")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return pdfResponse(await renderPdf(dataCopyPrint(copy, await getChurch(ctx))), name, true);
}
