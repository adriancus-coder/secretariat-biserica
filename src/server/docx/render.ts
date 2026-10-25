import "server-only";
import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
  Document,
  Footer,
  Header,
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
import { chartTable, type Block, type PrintSpec, type Signature } from "@/domain/print";
import { DEFAULT_LAYOUT, type PageLayout } from "@/lib/page-layout";
import { richLines, TEXT_SIZE_DELTA, type Align, type RichRun } from "@/lib/rich-text";
import { letterheadDetails } from "../pdf/render";

/**
 * The same printed documents as src/server/pdf/render.ts, as an editable Word file (.docx): the
 * church letterhead with its rule, the number on the right, the centered title, justified paragraphs,
 * the numbered points and the signatures. Plain paragraphs and tables only, so the file stays easy
 * to edit and re-arrange in Word.
 */

const FONT = "Times New Roman";
const BODY_PT = 12;
const PAGE_MM = { A4: { width: 210, height: 297 }, A5: { width: 148, height: 210 } };

/** Half-points (docx font sizes). */
const hp = (pt: number) => Math.round(pt * 2);
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

const ALIGNMENT: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

/** A rich-text run in Word: bold, italic, underline, size relative to the layout's; line breaks kept. */
function richRuns(r: RichRun, base: number): TextRun[] {
  const size = hp(base + TEXT_SIZE_DELTA[r.size ?? "normal"]);
  return r.text.split("\n").map(
    (part, i) =>
      new TextRun({ text: part, font: FONT, size, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, break: i ? 1 : 0 }),
  );
}

function blockToDocx(block: Block, L: PageLayout): (Paragraph | Table)[] {
  // Body text in the layout's size; line spacing in 240ths of a line.
  const t = (s: string, o: Parameters<typeof text>[1] = {}) => text(s, { ...o, size: o.size ?? L.fontSize });
  const ln = (s: string) => lines(s, { size: L.fontSize });
  const lineSpacing = { line: Math.round(L.lineHeight * 240) };
  const body = L.align === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
  switch (block.type) {
    case "nr":
      return [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 240 }, children: [t(block.text)] })];
    case "title":
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 240 },
          children: [t(block.text, { bold: true, size: L.fontSize + 4, allCaps: !block.asWritten })],
        }),
      ];
    case "para":
      // A text written on several lines becomes one paragraph per line (easier to edit in Word).
      if (block.pre) {
        const all = block.runs.map((r) => r.text).join("").split("\n");
        return all.map(
          (line, i) =>
            new Paragraph({ alignment: AlignmentType.LEFT, spacing: { ...lineSpacing, after: i === all.length - 1 ? 120 : 0 }, children: [t(line)] }),
        );
      }
      return [
        new Paragraph({
          alignment: body,
          spacing: { ...lineSpacing, after: 120 },
          children: block.runs.map((r) => t(r.text, { bold: r.bold })),
        }),
      ];
    case "rich": {
      // Same hanging indent as the lists: 8 mm per level, the marker before a tab.
      const lines = richLines(block.doc);
      const step = convertMillimetersToTwip(8);
      return lines.map((line, i) => {
        const level = line.level + (block.marker ? 1 : 0);
        const marker = block.marker && i === 0 ? block.marker : line.marker;
        return new Paragraph({
          alignment: line.align ? ALIGNMENT[line.align] : body,
          spacing: { ...lineSpacing, after: i === lines.length - 1 ? 120 : 0 },
          indent: level ? { left: step * level, ...(marker ? { hanging: convertMillimetersToTwip(6) } : {}) } : undefined,
          tabStops: level ? [{ type: "left", position: step * level }] : undefined,
          children: [...(marker ? [t(`${marker}\t`)] : []), ...line.runs.flatMap((r) => richRuns(r, L.fontSize))],
        });
      });
    }
    case "list":
      return block.items.map(
        (item, i) =>
          new Paragraph({
            alignment: body,
            spacing: { ...lineSpacing, after: 60 },
            indent: { left: convertMillimetersToTwip(8), hanging: convertMillimetersToTwip(6) },
            children: [t(`${block.ordered ? `${(block.start ?? 1) + i}.` : "•"}\t`), ...ln(item)],
            tabStops: [{ type: "left", position: convertMillimetersToTwip(8) }],
          }),
      );
    case "signatures": {
      const col = (s: Signature) => [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480 }, children: [t(s.label)] }),
        ...(s.image ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [image(s.image, 160, 40)] })] : []),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: s.image ? 60 : 600 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } }, children: [t(s.name || " ", { size: 11 })] }),
        ...(s.note ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [t(s.note, { size: 8, color: "555555" })] })] : []),
      ];
      return [twoColumns(col(block.left), col(block.right))];
    }
    case "signed": {
      const col = (s: Signature) => [
        new Paragraph({ spacing: { before: 240 }, children: [t(`${s.label}, ${s.name}`.replace(/, $/, ","))] }),
        new Paragraph({ spacing: { before: 120, after: 600 }, children: [t("Semnătura")] }),
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
        children: [cell([new Paragraph({ children: [t("Nume", { bold: true, size: 11 })] })], 50), cell([new Paragraph({ children: [t("Semnătura", { bold: true, size: 11 })] })], 50)],
      });
      const rows = block.rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: [
              cell([new Paragraph({ spacing: { before: 200, after: 200 }, children: [t(r.name)] })], 50),
              cell(
                r.image
                  ? [new Paragraph({ children: [image(r.image, 180, 40)] }), new Paragraph({ children: [t(`semnat ${r.signedAt ?? ""}`, { size: 8, color: "555555" })] })]
                  : [new Paragraph({ spacing: { before: 400 }, children: [] })],
                50,
              ),
            ],
          }),
      );
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] }), new Paragraph({ spacing: { after: 120 }, children: [] })];
    }
    case "table": {
      const line = { style: BorderStyle.SINGLE, size: 4, color: "999999" } as const;
      const borders = { top: line, bottom: line, left: line, right: line };
      const row = (cells: string[], bold: boolean) =>
        new TableRow({
          tableHeader: bold,
          cantSplit: true,
          children: block.columns.map((_, i) => new TableCell({ borders, children: [new Paragraph({ children: [t(cells[i] ?? "", { bold, size: 9 })] })] })),
        });
      return [
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row(block.columns, true), ...block.rows.map((r) => row(r, false))] }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }
    case "chart":
      return [
        new Paragraph({ spacing: { before: 120, after: 60 }, children: [t(block.title, { bold: true })] }),
        ...blockToDocx({ type: "table", columns: chartTable(block)[0], rows: chartTable(block).slice(1) }, L),
      ];
    case "centered":
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [t(block.text, { bold: block.bold, size: block.size })] })];
    case "image":
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [image(block.png, Math.round(block.width * 1.333), Math.round(block.width * 1.333))] })];
  }
}

/** The printed document as a .docx file. */
export async function renderDocx(spec: PrintSpec): Promise<Buffer> {
  const L = spec.layout ?? { ...DEFAULT_LAYOUT, format: spec.size ?? DEFAULT_LAYOUT.format, fontSize: BODY_PT };
  const base = PAGE_MM[L.format];
  const page = spec.landscape ? { width: base.height, height: base.width } : base;
  const details = letterheadDetails(spec.church);
  const letterhead = !L.letterhead ? [] : [
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
    styles: { default: { document: { run: { font: FONT, size: hp(L.fontSize) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertMillimetersToTwip(page.width), height: convertMillimetersToTwip(page.height) },
            margin: {
              top: convertMillimetersToTwip(L.marginTop),
              bottom: convertMillimetersToTwip(L.marginBottom),
              left: convertMillimetersToTwip(L.marginLeft),
              right: convertMillimetersToTwip(L.marginRight),
            },
          },
        },
        footers: { default: footer },
        // A draft or a document awaiting the pastor: the mark at the top of every page.
        ...(spec.watermark
          ? { headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text(spec.watermark, { size: 20, bold: true, color: "C0392B" })] })] }) } }
          : {}),
        children: [...letterhead, ...spec.blocks.flatMap((b) => blockToDocx(b, L))],
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
