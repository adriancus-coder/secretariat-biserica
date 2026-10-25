import ExcelJS from "exceljs";
import { requestedYear } from "@/lib/statistics-params";
import { statisticsTables, statisticsWhen } from "@/lib/statistics-report";
import { getChurch } from "@/server/queries/church";
import { loadStatistics } from "@/server/queries/statistics";
import { requireCtx } from "@/server/session";

/**
 * The Statistici tables as an Excel workbook, one sheet per table. Aggregate numbers only (no names
 * or contact data), so every role may download it, like the page itself.
 */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const [d, church] = await Promise.all([loadStatistics(ctx, requestedYear(new URL(req.url).searchParams.get("an"))), getChurch(ctx)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Secretariat Biserică";
  for (const t of statisticsTables(d)) {
    const ws = wb.addWorksheet(t.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 2 }] });
    ws.addRow([`Biserica ${church.nume} — ${t.name} — ${statisticsWhen(d)}`]).font = { bold: true, size: 12 };
    ws.addRow(t.columns).font = { bold: true };
    for (const r of t.rows) ws.addRow(r);
    ws.columns.forEach((c, i) => (c.width = i === 0 ? Math.max(12, ...t.rows.map((r) => String(r[0]).length + 2)) : Math.max(10, t.columns[i].length + 2)));
  }
  const body = Buffer.from(await wb.xlsx.writeBuffer());
  const name = `statistici-${d.year}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
