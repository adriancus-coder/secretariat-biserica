import { describe, expect, it } from "vitest";
import { eventPrint, groupPrint, printApplicationPoster, printToText, reportPrint, type Block, type PrintSpec } from "@/domain/print";
import { blockToRich, fixedLabel, parseStoredBlocks, resolveStored, storedToRich, toStored } from "./generated-blocks";
import { richToPlain } from "./rich-text";

const church = { nume: "Maranata Stavanger", adresa: "Kongsgårdbakken 1", codPostal: "4005", localitate: "Stavanger", orgNr: "912 345 678", telefon: "", email: "", pastor: "Daniel Mureșan", secretar: "Ioana Pop" };
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const chart: Block = { type: "chart", kind: "line", title: "Membri", labels: ["2025", "2026"], series: [{ name: "Membri", values: [10, 12] }] };
const table: Block = { type: "table", columns: ["Nume", "Telefon"], rows: [["Pop Ana", "1"]], bold: [false] };

const specs: PrintSpec[] = [
  eventPrint({ titlu: "Ziua mulțumirii", data: "2026-10-04", ora: "10:00", loc: "", invitat: "Pastor X", responsabil: "", oficiant: "", descriere: "Program\ncu agapă", agapaActiva: true, agapaResponsabil: "Lucia", agapaPersoane: 50, contributii: [{ cine: "Pop", ce: "cozonac" }] }, church),
  groupPrint({ nume: "Corul", responsabil: "Ana", membri: [{ nume: "Pop", prenume: "Ion", telefon: "1" }] }, church),
  reportPrint(2026, "Situația\n- 10 membri", church),
  printApplicationPoster(church, "https://x.ro/cerere/m", png),
  { title: "Statistici", church, blocks: [{ type: "title", text: "Statistici 2026" }, chart, table, { type: "table", columns: ["Foto", "Bun"], rows: [["", "Pian"]], images: [png] }] },
];

describe("GENERATED-EDIT blocks", () => {
  it.each(specs.map((s) => [s.title, s] as const))("%s: the unedited model gives the same blocks and the same printed text", (_t, spec) => {
    const stored = toStored(spec.blocks);
    // Nothing binary in the stored model.
    expect(JSON.stringify(stored)).not.toMatch(/"png":|"images":/);
    const back = resolveStored(JSON.parse(JSON.stringify(stored)), spec.blocks);
    expect(printToText({ ...spec, blocks: back })).toBe(printToText(spec));
    expect(back.length).toBe(spec.blocks.length);
    expect(parseStoredBlocks(JSON.stringify(stored)).ok).toBe(true);
  });

  it("signatures, charts, pictures and tables with photos are references to the fresh data", () => {
    const stored = toStored([chart, { type: "image", png, width: 100, alt: "QR" }, table]);
    expect(stored.slice(0, 2)).toEqual([
      { type: "fixed", of: "chart", nth: 0 },
      { type: "fixed", of: "image", nth: 0 },
    ]);
    expect(stored[2]).toEqual(table);
    // A reference the fresh document no longer has is left out.
    expect(resolveStored([{ type: "fixed", of: "chart", nth: 3 }], [chart])).toEqual([]);
    expect(fixedLabel(chart)).toBe("Grafic: Membri");
  });

  it("the form's model is checked: no pictures, tables with every column, bounded sizes", () => {
    expect(parseStoredBlocks(JSON.stringify([{ type: "image", png: [1, 2], width: 10, alt: "x" }])).ok).toBe(false);
    expect(parseStoredBlocks(JSON.stringify([{ type: "table", columns: ["a", "b"], rows: [["1"]] }])).ok).toBe(false);
    expect(parseStoredBlocks(JSON.stringify([{ type: "rich", doc: { type: "doc", content: [{ type: "image" }] } }])).ok).toBe(false);
    expect(parseStoredBlocks("nu e json").ok).toBe(false);
    expect(parseStoredBlocks(JSON.stringify([{ type: "title", text: "x".repeat(600) }])).ok).toBe(false);
    expect(parseStoredBlocks(JSON.stringify([{ type: "fixed", of: "chart", nth: 0 }])).ok).toBe(true);
  });

  it("paragraphs and lists open in the rich editor with their text and bold", () => {
    const para: Block = { type: "para", runs: [{ text: "Data:", bold: true }, { text: " 4 octombrie" }] };
    const doc = blockToRich(para)!;
    expect(richToPlain(doc)).toBe("Data: 4 octombrie");
    expect(JSON.stringify(doc)).toContain('"bold"');
    expect(richToPlain(blockToRich({ type: "list", items: ["Pop Ion", "Pop Ana"], ordered: true })!)).toBe("1. Pop Ion\n2. Pop Ana");
    expect(richToPlain(blockToRich({ type: "para", runs: [{ text: "a\nb" }], pre: true })!)).toBe("a\nb");
  });

  it("a registered act's text: headings, paragraphs and table rows, no signatures", () => {
    const stored = toStored([{ type: "title", text: "Convocare la audiere" }, { type: "para", runs: [{ text: "Vă convocăm." }] }, table, { type: "signatures", left: { label: "Pastor", name: "X" }, right: { label: "Secretar", name: "Y" } }]);
    expect(richToPlain(storedToRich(stored))).toBe("CONVOCARE LA AUDIERE\nVă convocăm.\nNume — Telefon\nPop Ana — 1");
  });
});
