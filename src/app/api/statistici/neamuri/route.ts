import ExcelJS from "exceljs";
import { NEAM_COLUMNS, neamRows } from "@/lib/kinship-report";
import { loadKinship } from "@/server/kinship";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** Statistici → Neamuri as an Excel sheet (the screen's sort). Every role that reads the register; not "Rugăciune". */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const [kin, church] = await Promise.all([loadKinship(ctx.db), getChurch(ctx)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Secretariat Biserică";
  const ws = wb.addWorksheet("Neamuri", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow([`Biserica ${church.nume} — Neamuri`]).font = { bold: true, size: 12 };
  ws.addRow(NEAM_COLUMNS.map((c) => c.label)).font = { bold: true };
  const rows = neamRows(kin.neamuri, { sort: sp.get("sort"), dir: sp.get("dir") });
  for (const r of rows) ws.addRow(r.sort);
  ws.columns.forEach((c, i) => (c.width = i === 0 ? Math.max(14, ...rows.map((r) => r.neam.name.length + 2)) : 12));
  const body = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="neamuri.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
