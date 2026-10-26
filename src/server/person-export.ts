import "server-only";
import { loadConsentStates } from "./consents";
import { contactRestricted } from "@/lib/contact-access";
import ExcelJS from "exceljs";
import { fmtDot, type PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";
import { fromDbDate, toDbDate, todayIso } from "@/lib/dates";
import { columnLabel, exportRows, type ExportColumn, type ExportPerson } from "@/lib/person-export";
import { rolesText } from "@/lib/roles";
import { compareRo } from "@/lib/text";
import type { Ctx } from "./session";

/** The persons of an export with every column's data, in the order of `ids`. */
export async function loadExportPersons(ctx: Ctx, ids: string[]): Promise<ExportPerson[]> {
  if (!ids.length) return [];
  const today = toDbDate(todayIso())!;
  const rows = await ctx.db.person.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      nume: true,
      prenume: true,
      gen: true,
      dataNasterii: true,
      statut: true,
      dataIesire: true,
      familyId: true,
      family: { select: { nume: true } },
      rudenie: true,
      telefon: true,
      email: true,
      adresa: true,
      dataMembru: true,
      modIntrare: true,
      dataBotez: true,
      botezAn: true,
      botezBiserica: true,
      dataCasatoriei: true,
      necasatorit: true,
      inComitet: true,
      roles: {
        where: { OR: [{ until: null }, { until: { gte: today } }] },
        select: { since: true, role: { select: { nume: true, sortOrder: true, group: { select: { sortOrder: true } } } } },
      },
      groups: { select: { group: { select: { nume: true } } } },
    },
  });
  const byId = new Map(rows.map((p) => [p.id, p]));
  const consents = await loadConsentStates(ctx, ids);
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      id: p.id,
      nume: p.nume,
      prenume: p.prenume,
      gen: p.gen,
      dataNasterii: fromDbDate(p.dataNasterii),
      statut: p.statut,
      familie: p.family?.nume ?? "",
      familyId: p.familyId,
      rudenie: p.rudenie,
      // Contact data of a person who left: administrators only (Statut art. 14; privacy notice point 6).
      ...(contactRestricted(p, ctx.user.role) ? { telefon: "", email: "", adresa: "" } : { telefon: p.telefon, email: p.email, adresa: p.adresa }),
      dataMembru: fromDbDate(p.dataMembru),
      modIntrare: p.modIntrare,
      dataBotez: fromDbDate(p.dataBotez),
      botezAn: p.botezAn,
      botezBiserica: p.botezBiserica,
      dataCasatoriei: fromDbDate(p.dataCasatoriei),
      necasatorit: p.necasatorit,
      functii: rolesText(
        [...p.roles]
          .sort((a, b) => a.role.group.sortOrder - b.role.group.sortOrder || a.role.sortOrder - b.role.sortOrder)
          .map((r) => ({ nume: r.role.nume, since: fromDbDate(r.since) })),
      ),
      inComitet: p.inComitet,
      grupuri: p.groups.map((g) => g.group.nume).sort(compareRo).join(", "),
      acorduri: consents.get(p.id) ?? {},
    }));
}

export interface ExportDoc {
  church: ChurchInfo;
  title: string;
  /** "Situația la 25.10.2026" / "Anul 2025". */
  when: string;
  columns: ExportColumn[];
  persons: ExportPerson[];
  refDate: string;
}

/** Excel: a title row (church, categories, date), the header row bold and frozen, one sheet. */
export async function exportXlsx(d: ExportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Secretariat Biserică";
  const ws = wb.addWorksheet("Persoane", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow([`Biserica ${d.church.nume} — ${d.title} — ${d.when} (${d.persons.length} persoane)`]).font = { bold: true, size: 12 };
  const header = ws.addRow(d.columns.map(columnLabel));
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEBE4" } };
    c.border = { bottom: { style: "thin" } };
  });
  for (const r of exportRows(d.persons, d.columns, d.refDate)) ws.addRow(r);
  d.columns.forEach((c, i) => {
    const longest = Math.max(columnLabel(c).length, ...exportRows(d.persons.slice(0, 500), [c], d.refDate).map((r) => r[0].length));
    ws.getColumn(i + 1).width = Math.min(45, Math.max(8, longest + 2));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The PDF list: letterhead, title, a table; landscape when more than six columns. */
export function exportPdfSpec(d: ExportDoc): PrintSpec {
  return {
    title: `${d.title} — ${d.when}`,
    church: d.church,
    landscape: d.columns.length > 6,
    blocks: [
      { type: "title", text: d.title, asWritten: true },
      { type: "centered", text: `${d.when} · ${d.persons.length} persoane`, size: 11 },
      { type: "table", columns: d.columns.map(columnLabel), rows: exportRows(d.persons, d.columns, d.refDate) },
    ],
    footer: `Generat la ${fmtDot(todayIso())}`,
  };
}

