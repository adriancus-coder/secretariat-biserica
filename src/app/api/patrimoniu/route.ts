import ExcelJS from "exceljs";
import { todayIso } from "@/lib/dates";
import { ASSET_COLUMNS, ASSET_STATE_LABEL, categoryTotals, inventoryTitle, sortedAssets, subcategoryLabel } from "@/lib/patrimony";
import { exportAssets } from "@/server/assets-export";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

/** The inventory as an Excel workbook: the goods (the page's filter and sort, with „Subcategorie”) and the totals per category with subtotals per subcategory. */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const sp = new URL(req.url).searchParams;
  const today = todayIso();
  const [rows, church] = await Promise.all([exportAssets(ctx, sp), getChurch(ctx)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Secretariat Biserică";
  const ws = wb.addWorksheet("Inventar", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow([`Biserica ${church.nume} — ${inventoryTitle(today)}`]).font = { bold: true, size: 12 };
  ws.addRow(ASSET_COLUMNS.map((c) => c.label)).font = { bold: true };
  for (const a of sortedAssets(rows, { sort: sp.get("sort"), dir: sp.get("dir") })) ws.addRow([a.nrInventar, a.denumire, a.categorie, a.subcategorie, a.cantitate, a.valoare, a.loc, ASSET_STATE_LABEL[a.stare], a.dataIntrarii ? new Date(`${a.dataIntrarii}T00:00:00Z`) : null]);
  ws.columns.forEach((c, i) => (c.width = [10, 36, 22, 22, 10, 14, 22, 18, 14][i] ?? 14));
  ws.getColumn(9).numFmt = "dd.mm.yyyy";
  const t = wb.addWorksheet("Totaluri");
  t.addRow(["Categorie", "Subcategorie", "Poziții", "Bucăți", "Valoare (NOK)"]).font = { bold: true };
  for (const x of categoryTotals(rows)) {
    t.addRow([x.categorie, "", x.pozitii, x.bucati, x.valoare]).font = { bold: true };
    for (const y of x.sub) t.addRow([x.categorie, subcategoryLabel(y.subcategorie), y.pozitii, y.bucati, y.valoare]);
  }
  t.columns.forEach((c, i) => (c.width = i < 2 ? 26 : 14));
  const body = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventar-${today}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
