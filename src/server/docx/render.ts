import "server-only";
import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import type { Block, PrintSpec, Signature } from "@/domain/print";
import { letterheadDetails } from "../pdf/render";

/**
 * The same printed documents as src/server/pdf/render.ts, as an editable Word file (.docx): the
 * church letterhead with its rule, the number on the right, the centered title, justified paragraphs,
 * the numbered points and the signatures. Plain paragraphs and tables only, so the file stays easy
 * to edit and re-arrange in Word.
 */

const FONT = "Times New Roman";
const BODY_PT = 12;
const LINE = 1.4;
const MM = { top: 22, bottom: 22, left: 20, right: 20 };
const PAGE_MM = { A4: { width: 210, height: 297 }, A5: { width: 148, height: 210 } };

/** Half-points (docx font sizes) and line spacing in 240ths of a line. */
const hp = (pt: number) => Math.round(pt * 2);
const lineSpacing = { line: Math.round(LINE * 240) };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

const text = (t: string, opts: { bold?: boolean; size?: number; color?: string; allCaps?: boolean } = {}) =>
  new TextRun({ text: t, font: FONT, size: hp(opts.size ?? BODY_PT), bold: opts.bold, color: opts.color, allCaps: opts.allCaps });

/** Keeps the line breaks of a text written on several lines. */
function lines(t: string, opts: Parameters<typeof text>[1] = {}): ParagraphChild[] {
  return t.split("\n").map((line, i) => new TextRun({ text: line, font: FONT, size: hp(opts.size ?? BODY_PT), bold: opts.bold, break: i ? 1 : 0 }));
}

/** Width and height of a PNG, from its header (signatures are re-encoded PNGs). */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return png.length > 24 ? { width: v.getUint32(16), height: v.getUint32(20) } : { width: 300, height: 100 };
}

function image(png: Uint8Array, maxWidth: number, maxHeight: number): ImageRun {
  const s = pngSize(png);
  const k = Math.min(maxWidth / s.width, maxHeight / s.height, 1);
  return new ImageRun({ type: "png", data: png, transformation: { width: Math.round(s.width * k), height: Math.round(s.height * k) } });
}

function twoColumns(left: Paragraph[], right: Paragraph[]): Table {
  const cell = (children: Paragraph[]) => new TableCell({ children, width: { size: 45, type: WidthType.PERCENTAGE }, borders: NO_BORDERS });
  const gap = new TableCell({ children: [new Paragraph({})], width: { size: 10, type: WidthType.PERCENTAGE }, borders: NO_BORDERS });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: [new TableRow({ children: [cell(left), gap, cell(right)] })] });
}

function blockToDocx(block: Block): (Paragraph | Table)[] {
  switch (block.type) {
    case "nr":
      return [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 240 }, children: [text(block.text)] })];
    case "title":
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 240 },
          children: [text(block.text, { bold: true, size: 16, allCaps: !block.asWritten })],
        }),
      ];
    case "para":
      // A text written on several lines becomes one paragraph per line (easier to edit in Word).
      if (block.pre) {
        const all = block.runs.map((r) => r.text).join("").split("\n");
        return all.map(
          (line, i) =>
            new Paragraph({ alignment: AlignmentType.LEFT, spacing: { ...lineSpacing, after: i === all.length - 1 ? 120 : 0 }, children: [text(line)] }),
        );
      }
      return [
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { ...lineSpacing, after: 120 },
          children: block.runs.map((r) => text(r.text, { bold: r.bold })),
        }),
      ];
    case "list":
      return block.items.map(
        (item, i) =>
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { ...lineSpacing, after: 60 },
            indent: { left: convertMillimetersToTwip(8), hanging: convertMillimetersToTwip(6) },
            children: [text(`${block.ordered ? `${i + 1}.` : "•"}\t`), ...lines(item)],
            tabStops: [{ type: "left", position: convertMillimetersToTwip(8) }],
          }),
      );
    case "signatures": {
      const col = (s: Signature) => [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480 }, children: [text(s.label)] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } }, children: [text(s.name || " ", { size: 11 })] }),
      ];
      return [twoColumns(col(block.left), col(block.right))];
    }
    case "signed": {
      const col = (s: Signature) => [
        new Paragraph({ spacing: { before: 240 }, children: [text(`${s.label}, ${s.name}`.replace(/, $/, ","))] }),
        new Paragraph({ spacing: { before: 120, after: 600 }, children: [text("Semnătura")] }),
        new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } }, children: [] }),
      ];
      return [twoColumns(col(block.left), col(block.right))];
    }
    case "signatureTable": {
      const line = { style: BorderStyle.SINGLE, size: 4, color: "999999" } as const;
      const borders = { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: line };
      const cell = (children: Paragraph[], pct: number) => new TableCell({ children, width: { size: pct, type: WidthType.PERCENTAGE }, borders });
      const header = new TableRow({
        tableHeader: true,
        children: [cell([new Paragraph({ children: [text("Nume", { bold: true, size: 11 })] })], 50), cell([new Paragraph({ children: [text("Semnătura", { bold: true, size: 11 })] })], 50)],
      });
      const rows = block.rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: [
              cell([new Paragraph({ spacing: { before: 200, after: 200 }, children: [text(r.name)] })], 50),
              cell(
                r.image
                  ? [new Paragraph({ children: [image(r.image, 180, 40)] }), new Paragraph({ children: [text(`semnat ${r.signedAt ?? ""}`, { size: 8, color: "555555" })] })]
                  : [new Paragraph({ spacing: { before: 400 }, children: [] })],
                50,
              ),
            ],
          }),
      );
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] }), new Paragraph({ spacing: { after: 120 }, children: [] })];
    }
    case "centered":
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [text(block.text, { bold: block.bold, size: block.size })] })];
    case "image":
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [image(block.png, Math.round(block.width * 1.333), Math.round(block.width * 1.333))] })];
  }
}

/** The printed document as a .docx file. */
export async function renderDocx(spec: PrintSpec): Promise<Buffer> {
  const page = PAGE_MM[spec.size ?? "A4"];
  const details = letterheadDetails(spec.church);
  const letterhead = [
    new Paragraph({ children: [text(`Biserica ${spec.church.nume}`.trim(), { bold: true, size: 18 })] }),
    ...(details ? [new Paragraph({ children: [text(details, { size: 10.5, color: "333333" })] })] : []),
    new Paragraph({ spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000", space: 4 } }, children: [] }),
  ];
  const footer = new Footer({
    children: [
      ...(spec.footer ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [text(spec.footer, { size: 9, color: "555555" })] })] : []),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ font: FONT, size: hp(9), color: "555555", children: ["Pagina ", PageNumber.CURRENT, " din ", PageNumber.TOTAL_PAGES] }),
        ],
      }),
    ],
  });
  const doc = new Document({
    creator: "Secretariat Biserică",
    title: spec.title,
    styles: { default: { document: { run: { font: FONT, size: hp(BODY_PT) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertMillimetersToTwip(page.width), height: convertMillimetersToTwip(page.height) },
            margin: {
              top: convertMillimetersToTwip(MM.top),
              bottom: convertMillimetersToTwip(MM.bottom),
              left: convertMillimetersToTwip(MM.left),
              right: convertMillimetersToTwip(MM.right),
            },
          },
        },
        footers: { default: footer },
        children: [...letterhead, ...spec.blocks.flatMap(blockToDocx)],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A .docx download (attachment, so phones hand it to Word or the files app). */
export function docxResponse(docx: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
