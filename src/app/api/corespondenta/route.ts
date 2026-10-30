import ExcelJS from "exceljs";
import { exportCells, REGISTER_COLUMNS, registerTitle, sortedRows } from "@/lib/correspondence";
import { exportRegister } from "@/server/correspondence-export";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";
import { churchTitle } from "@/lib/church-name";

/** „Registru de intrare-ieșire <an>” as an Excel sheet (the page's year, filter, search and sort). Every role that reads the register. */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const [{ an, rows }, church] = await Promise.all([exportRegister(ctx, sp), getChurch(ctx)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Secretariat Biserică";
  const ws = wb.addWorksheet(`Registru ${an}`, { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow([`${churchTitle(church.nume)} — ${registerTitle(an)}`]).font = { bold: true, size: 12 };
  ws.addRow(REGISTER_COLUMNS.map((c) => c.label)).font = { bold: true };
  for (const r of sortedRows(rows, { sort: sp.get("sort"), dir: sp.get("dir") })) ws.addRow(exportCells(r));
  ws.columns.forEach((c, i) => (c.width = [8, 12, 14, 30, 40, 26, 14][i] ?? 14));
  const body = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="registru-intrare-iesire-${an}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
