import { sensitiveCheck, stepUpMethod } from "@/server/step-up";
import { cookies } from "next/headers";
import { statsEndDate } from "@/domain/stats";
import { kinshipRank } from "@/lib/kinship";
import { todayIso } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { exportFileName, exportRows, columnLabel, selectionTitle, sortForExport, toCsv } from "@/lib/person-export";
import { personExportInput, personExportSchema } from "@/lib/schemas/person-export";
import { prisma } from "@/server/db";
import { EXPORT_GRANT_COOKIE, grantCookieHeader, hasGrant } from "@/server/export-grant";
import { exportPdfSpec, exportXlsx, loadExportPersons } from "@/server/person-export";
import { renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { selectionIds } from "@/server/queries/categories";
import { requireCtx } from "@/server/session";

const TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
} as const;

/** The export page again, with the form's values and a message. */
function back(req: Request, form: FormData, reason: string): Response {
  const sp = new URLSearchParams();
  for (const [k, v] of form.entries()) if (k !== "parola" && typeof v === "string") sp.append(k, v);
  sp.set("eroare", reason);
  return Response.redirect(new URL(`/persoane/export?${sp}`, process.env.APP_URL || req.url), 303);
}

/**
 * Export of a list of persons (Excel, CSV or PDF) for Administrator and Secretar. Personal data: the
 * password is asked again (then remembered for 10 minutes), and each export writes a SECURITY audit
 * entry with the categories, the row count and the format — never the names.
 */
export async function POST(req: Request) {
  const ctx = await requireCtx("export");
  const form = await req.formData();
  const parsed = personExportSchema.safeParse(personExportInput(form));
  if (!parsed.success) return back(req, form, "date");
  const granted = hasGrant((await cookies()).get(EXPORT_GRANT_COOKIE)?.value, ctx.user.id);
  let grant: string | null = null;
  if (!granted || (await stepUpMethod(ctx.user.id)) === "passkey") {
    // With a passkey: the device confirmation (step-up, 15 minutes); otherwise the password (10-minute grant).
    const check = await sensitiveCheck(ctx.user, String(form.get("parola") ?? ""));
    if (check !== "ok") return back(req, form, check === "device" ? "confirmare" : "parola");
    if (!granted) grant = grantCookieHeader(ctx.user.id, (process.env.APP_URL ?? "").startsWith("https://"));
  }
  const { categorie, mod, an, functie, coloane, ordine, format } = parsed.data;
  const today = todayIso();
  const [ids, church] = await Promise.all([selectionIds(ctx, { keys: categorie, year: an, functie }, mod), getChurch(ctx)]);
  const persons = sortForExport(await loadExportPersons(ctx, ids), ordine, kinshipRank(church.nomen.rudenie));
  const refDate = statsEndDate(today, an);
  const title = selectionTitle(categorie, mod);
  const doc = { church, title, when: an && refDate !== today ? `Anul ${an} (situația la ${fmt(refDate)})` : `Situația la ${fmt(today)}`, columns: coloane, persons, refDate };
  const body =
    format === "xlsx"
      ? await exportXlsx(doc)
      : format === "csv"
        ? Buffer.from(toCsv(coloane.map(columnLabel), exportRows(persons, coloane, refDate)), "utf8")
        : await renderPdf(exportPdfSpec(doc));
  const name = exportFileName(categorie, today, format);
  await prisma.auditLog.create({
    data: {
      churchId: ctx.user.churchId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      entity: "SECURITY",
      entityId: ctx.user.churchId,
      entityLabel: "Export listă de persoane",
      action: "CREATE",
      changes: { categorii: title, an: an ?? "la zi", randuri: persons.length, format },
    },
  });
  const headers = new Headers({
    "Content-Type": TYPES[format],
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (grant) headers.append("Set-Cookie", grant);
  return new Response(new Uint8Array(body), { headers });
}
