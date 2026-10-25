import { fmtDot, type Block, type PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";

/**
 * "Copie a datelor (art. 15 GDPR)": everything the register holds about one person, as named
 * sections of label → value rows (and tables). The same structure becomes the JSON file and the PDF.
 * Pure.
 */
export interface DataCopySection {
  titlu: string;
  /** label → value; empty values are left out. */
  campuri?: [string, string][];
  /** A table (meetings attended, documents, roles…). */
  tabel?: { coloane: string[]; randuri: string[][] };
}

export interface DataCopy {
  persoana: string;
  generatLa: string;
  sectiuni: DataCopySection[];
}

/** The JSON file: sections with their non-empty fields. */
export function dataCopyJson(c: DataCopy): Record<string, unknown> {
  return {
    persoana: c.persoana,
    generatLa: c.generatLa,
    sectiuni: c.sectiuni.map((s) => ({
      titlu: s.titlu,
      ...(s.campuri ? { campuri: Object.fromEntries(s.campuri.filter(([, v]) => v)) } : {}),
      ...(s.tabel ? { tabel: s.tabel } : {}),
    })),
  };
}

export function dataCopyPrint(c: DataCopy, church: ChurchInfo): PrintSpec {
  const blocks: Block[] = [
    { type: "title", text: "Copie a datelor cu caracter personal" },
    { type: "centered", text: `${c.persoana} · art. 15 din Regulamentul general privind protecția datelor`, size: 10 },
  ];
  for (const s of c.sectiuni) {
    const rows = (s.campuri ?? []).filter(([, v]) => v);
    if (!rows.length && !s.tabel?.randuri.length) continue;
    blocks.push({ type: "para", runs: [{ text: s.titlu, bold: true }] });
    if (rows.length) blocks.push({ type: "table", columns: ["Câmp", "Valoare"], rows });
    if (s.tabel?.randuri.length) blocks.push({ type: "table", columns: s.tabel.coloane, rows: s.tabel.randuri });
  }
  return { title: `Copie a datelor — ${c.persoana}`, church, blocks, footer: `Generat la ${fmtDot(c.generatLa)}` };
}
