import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Block, PrintSpec, Signature } from "@/domain/print";
import { DEFAULT_LAYOUT } from "@/lib/page-layout";
import { richLines, TEXT_SIZE_DELTA, type RichRun } from "@/lib/rich-text";
import type { ChurchInfo } from "@/domain/types";

/**
 * Generarea PDF-urilor pe server (pdfkit), reproducând macheta de tipărire din prototip:
 * antetul bisericii subliniat, numărul de înregistrare aliniat la dreapta, titlul centrat cu
 * majuscule, paragrafe justificate (cu păstrarea rândurilor) și semnăturile pe două coloane.
 */

const MM = 72 / 25.4;

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONTS = {
  regular: path.join(FONT_DIR, "SourceSerif4-Regular.ttf"),
  semibold: path.join(FONT_DIR, "SourceSerif4-SemiBold.ttf"),
  bold: path.join(FONT_DIR, "SourceSerif4-Bold.ttf"),
  italic: path.join(FONT_DIR, "SourceSerif4-Italic.ttf"),
  boldItalic: path.join(FONT_DIR, "SourceSerif4-BoldItalic.ttf"),
};

/** The font of a rich-text run. */
const runFont = (r: { bold?: boolean; italic?: boolean }) => (r.bold ? (r.italic ? "Serif-BoldItalic" : "Serif-Bold") : r.italic ? "Serif-Italic" : "Serif");

/** pdfkit drops the space at the start of a continued fragment: move it to the end of the previous one. */
function joinableRuns<R extends { text: string }>(runs: readonly R[]): R[] {
  return runs
    .filter((r) => r.text !== "")
    .map((r) => ({ ...r }))
    .map((r, i, all) => {
      if (i > 0 && /^\s/.test(r.text) && !/^\n/.test(r.text)) {
        all[i - 1].text += " ";
        r.text = r.text.replace(/^\s+/, "");
      }
      return r;
    })
    .filter((r) => r.text !== "");
}

/** Linia de detalii din antet: adresă · Org.nr. · telefon · e-mail. */
export function letterheadDetails(c: ChurchInfo): string {
  return [c.adresa, c.orgNr ? `Org.nr. ${c.orgNr}` : "", c.telefon, c.email].filter(Boolean).join(" · ");
}

const CHART_COLORS = ["#2f5d8a", "#c0862b", "#7a4e8c", "#3f8a5a"];

/** A chart block drawn as vectors: title, three grid lines, the marks and their values, a legend. */
function drawChart(doc: PDFKit.PDFDocument, block: Extract<Block, { type: "chart" }>, left: number, width: number, bottomLimit: () => number) {
  const rowH = 16;
  const plotH = block.kind === "pyramid" ? block.labels.length * rowH : 130;
  const total = 18 + plotH + 34;
  if (doc.y + total > bottomLimit()) doc.addPage();
  const top = doc.y;
  doc.font("Serif-Bold").fontSize(10).fillColor("#000").text(block.title, left, top, { width, lineBreak: false });
  const y0 = top + 18;
  doc.font("Serif").fontSize(7.5);
  if (block.kind === "pyramid") {
    const [m, f] = block.series;
    const mid = left + width / 2;
    const half = width / 2 - 40;
    const max = Math.max(1, ...m.values, ...f.values);
    block.labels.forEach((l, i) => {
      const y = y0 + i * rowH;
      const lm = (half * (m.values[i] ?? 0)) / max;
      const lf = (half * (f.values[i] ?? 0)) / max;
      doc.rect(mid - 22 - lm, y, Math.max(lm, 0.5), rowH - 4).fill(CHART_COLORS[0]);
      doc.rect(mid + 22, y, Math.max(lf, 0.5), rowH - 4).fill(CHART_COLORS[2]);
      doc.fillColor("#000").text(l, mid - 22, y + 3, { width: 44, align: "center", lineBreak: false });
      doc.text(String(m.values[i] ?? 0), mid - 52 - lm, y + 3, { width: 28, align: "right", lineBreak: false });
      doc.text(String(f.values[i] ?? 0), mid + 26 + lf, y + 3, { width: 28, lineBreak: false });
    });
  } else {
    const plotL = left + 26;
    const plotW = width - 30;
    const totals = block.labels.map((_, i) => (block.kind === "bars" ? block.series.reduce((a, s) => a + (s.values[i] ?? 0), 0) : Math.max(0, ...block.series.map((s) => s.values[i] ?? 0))));
    const raw = Math.max(1, ...totals);
    const p = raw <= 5 ? 1 : 10 ** Math.floor(Math.log10(raw));
    const max = raw <= 5 ? 5 : Math.ceil(raw / p) * p;
    const yOf = (v: number) => y0 + plotH - (plotH * v) / max;
    for (const f of [0, 0.5, 1]) {
      doc.moveTo(plotL, yOf(max * f)).lineTo(plotL + plotW, yOf(max * f)).lineWidth(0.3).strokeColor("#999").stroke();
      doc.fillColor("#555").text(String(Math.round(max * f)), left, yOf(max * f) - 3, { width: 22, align: "right", lineBreak: false });
    }
    const slot = plotW / block.labels.length;
    const xOf = (i: number) => plotL + slot * i + slot / 2;
    block.labels.forEach((l, i) => doc.fillColor("#555").text(l, xOf(i) - slot / 2, y0 + plotH + 3, { width: slot, align: "center", lineBreak: false }));
    if (block.kind === "bars") {
      const bw = Math.min(22, slot * 0.6);
      block.labels.forEach((_, i) => {
        let base = y0 + plotH;
        block.series.forEach((s, si) => {
          const h = (plotH * (s.values[i] ?? 0)) / max;
          if (!h) return;
          base -= h;
          doc.rect(xOf(i) - bw / 2, base, bw, h).fill(CHART_COLORS[si % CHART_COLORS.length]);
        });
        if (totals[i]) doc.fillColor("#000").text(String(totals[i]), xOf(i) - slot / 2, base - 9, { width: slot, align: "center", lineBreak: false });
      });
    } else {
      block.series.forEach((s, si) => {
        const color = CHART_COLORS[si % CHART_COLORS.length];
        s.values.forEach((v, i) => (i ? doc.lineTo(xOf(i), yOf(v)) : doc.moveTo(xOf(i), yOf(v))));
        doc.lineWidth(1.5).strokeColor(color).stroke();
        s.values.forEach((v, i) => {
          doc.circle(xOf(i), yOf(v), 2).fill(color);
          doc.fillColor("#000").text(String(v), xOf(i) - slot / 2, yOf(v) - 10, { width: slot, align: "center", lineBreak: false });
        });
      });
    }
  }
  // Legend.
  let lx = left;
  const ly = y0 + plotH + 16;
  block.series.forEach((s, si) => {
    doc.rect(lx, ly, 7, 7).fill(CHART_COLORS[block.kind === "pyramid" ? si * 2 : si % CHART_COLORS.length]);
    doc.fillColor("#000").font("Serif").fontSize(8).text(s.name, lx + 10, ly - 1, { lineBreak: false });
    lx += 16 + doc.widthOfString(s.name);
  });
  doc.x = left;
  doc.y = top + total;
}

export async function renderPdf(spec: PrintSpec): Promise<Buffer> {
  // Page layout: the spec's (minutes), else the defaults; `size` alone is used by the poster.
  const layout = spec.layout ?? { ...DEFAULT_LAYOUT, format: spec.size ?? DEFAULT_LAYOUT.format };
  const MARGIN = { top: layout.marginTop * MM, bottom: layout.marginBottom * MM, left: layout.marginLeft * MM, right: layout.marginRight * MM };
  const BODY_SIZE = layout.fontSize;
  const LINE_HEIGHT = layout.lineHeight;
  const doc = new PDFDocument({
    size: layout.format,
    layout: spec.landscape ? "landscape" : "portrait",
    margins: MARGIN,
    bufferPages: true,
    info: {
      Title: spec.title,
      Author: `Biserica ${spec.church.nume}`.trim(),
      Creator: "Secretariat Biserică",
    },
    lang: "ro-RO",
    displayTitle: true,
  });
  doc.registerFont("Serif", FONTS.regular);
  doc.registerFont("Serif-SemiBold", FONTS.semibold);
  doc.registerFont("Serif-Bold", FONTS.bold);
  doc.registerFont("Serif-Italic", FONTS.italic);
  doc.registerFont("Serif-BoldItalic", FONTS.boldItalic);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = MARGIN.left;
  const width = doc.page.width - MARGIN.left - MARGIN.right;
  const bottomLimit = () => doc.page.height - MARGIN.bottom;

  /** The extra space between lines for the layout's line height. */
  const lineGap = (size: number) => {
    doc.fontSize(size);
    return Math.max(0, size * LINE_HEIGHT - doc.currentLineHeight());
  };

  // Antetul bisericii (left out for paper with a printed letterhead: the top margin leaves its room)
  if (layout.letterhead) {
    doc.fillColor("#000").font("Serif-SemiBold").fontSize(18);
    doc.text(`Biserica ${spec.church.nume}`.trim(), left, MARGIN.top, { width });
    const details = letterheadDetails(spec.church);
    if (details) {
      doc.moveDown(0.15).font("Serif").fontSize(10.5).fillColor("#333").text(details, { width });
    }
    const lineY = doc.y + 8;
    doc.moveTo(left, lineY).lineTo(left + width, lineY).lineWidth(2).strokeColor("#000").stroke();
    doc.fillColor("#000");
    doc.y = lineY + 24;
  } else {
    doc.fillColor("#000");
    doc.y = MARGIN.top;
  }

  for (const block of spec.blocks) {
    switch (block.type) {
      case "nr": {
        doc.font("Serif").fontSize(BODY_SIZE).text(block.text, left, doc.y, { width, align: "right" });
        doc.y += 18;
        break;
      }
      case "title": {
        const titleSize = BODY_SIZE + 4;
        doc.font("Serif-SemiBold").fontSize(titleSize);
        doc.text(block.asWritten ? block.text : block.text.toLocaleUpperCase("ro-RO"), left, doc.y, {
          width,
          align: "center",
          characterSpacing: block.asWritten ? 0 : titleSize * 0.06,
        });
        doc.y += 18;
        break;
      }
      case "para": {
        const gap = lineGap(BODY_SIZE);
        const runs = joinableRuns(block.runs);
        if (!runs.length) break;
        doc.x = left;
        runs.forEach((r, i) => {
          doc.font(r.bold ? "Serif-Bold" : "Serif").fontSize(BODY_SIZE);
          doc.text(r.text, {
            width,
            align: layout.align,
            lineGap: gap,
            continued: i < runs.length - 1,
          });
        });
        doc.y += 10;
        break;
      }
      case "rich": {
        // Hanging indent: the point's marker ("1.") and list markers in an 18 pt column, text 4 pt after it.
        const indent = 22;
        const base = left + (block.marker ? indent : 0);
        richLines(block.doc).forEach((line, li) => {
          const sizes = line.runs.map((r) => BODY_SIZE + TEXT_SIZE_DELTA[r.size ?? "normal"]);
          const top = Math.max(BODY_SIZE, ...sizes);
          const gap = lineGap(top);
          if (doc.y + top * 2 > bottomLimit()) doc.addPage();
          const lineLeft = base + indent * Math.max(0, line.level - 1);
          const textLeft = lineLeft + (line.level ? indent : 0);
          const textWidth = left + width - textLeft;
          const y = doc.y;
          doc.font("Serif").fontSize(BODY_SIZE).fillColor("#000");
          if (block.marker && li === 0) doc.text(block.marker, left, y, { width: indent - 4, align: "right", lineBreak: false });
          if (line.marker) doc.text(line.marker, lineLeft, y, { width: indent - 4, align: "right", lineBreak: false });
          const runs = joinableRuns<RichRun>(line.runs);
          if (!runs.length) {
            doc.x = left;
            doc.y = y + top * LINE_HEIGHT;
            return;
          }
          const align = line.align ?? layout.align;
          runs.forEach((r, i) => {
            doc.font(runFont(r)).fontSize(BODY_SIZE + TEXT_SIZE_DELTA[r.size ?? "normal"]);
            const opts = { width: textWidth, align, lineGap: gap, underline: Boolean(r.underline), continued: i < runs.length - 1 };
            if (i === 0) doc.text(r.text, textLeft, y, opts);
            else doc.text(r.text, opts);
          });
          doc.x = left;
        });
        doc.x = left;
        doc.y += 10;
        break;
      }
      case "list": {
        const gap = lineGap(BODY_SIZE);
        const indent = 18;
        block.items.forEach((item, i) => {
          doc.font("Serif").fontSize(BODY_SIZE);
          const marker = block.ordered ? `${(block.start ?? 1) + i}.` : "•";
          const h = doc.heightOfString(item, { width: width - indent, lineGap: gap });
          if (doc.y + Math.min(h, BODY_SIZE * 2) > bottomLimit()) doc.addPage();
          const y = doc.y;
          doc.text(marker, left, y, { width: indent - 4, align: "right", lineBreak: false });
          doc.text(item, left + indent + 4, y, { width: width - indent - 4, lineGap: gap });
        });
        doc.x = left;
        doc.y += 10;
        break;
      }
      case "signatures": {
        const blockHeight = 48 + BODY_SIZE * LINE_HEIGHT + 36 + 4 + 11 * 1.5;
        if (doc.y + blockHeight > bottomLimit()) doc.addPage();
        const colW = width * 0.45;
        const top = doc.y + 48;
        const cols: [Signature, number][] = [
          [block.left, left],
          [block.right, left + width - colW],
        ];
        for (const [sig, x] of cols) {
          doc.font("Serif").fontSize(BODY_SIZE).fillColor("#000");
          doc.text(sig.label, x, top, { width: colW, align: "center" });
          const ly = top + BODY_SIZE * LINE_HEIGHT + 36;
          // A signed document: the drawn signature above the line.
          if (sig.image) doc.image(Buffer.from(sig.image), x + colW * 0.15, ly - 36, { fit: [colW * 0.7, 34], align: "center", valign: "bottom" });
          doc.moveTo(x, ly).lineTo(x + colW, ly).lineWidth(1).strokeColor("#000").stroke();
          doc.fontSize(11).text(sig.name || " ", x, ly + 4, { width: colW, align: "center" });
          if (sig.note) doc.fontSize(8).fillColor("#555").text(sig.note, x, ly + 4 + 11 * 1.4, { width: colW, align: "center" });
        }
        doc.x = left;
        doc.y = top + blockHeight - 48;
        break;
      }
      case "signatureTable": {
        // Two columns: name | signature (image with the signing time under it, or a line to sign on paper).
        const nameW = width * 0.5;
        const sigX = left + nameW + 12;
        const sigW = width - nameW - 12;
        const rowH = 52;
        const header = () => {
          doc.font("Serif-SemiBold").fontSize(11).fillColor("#000");
          const y = doc.y;
          doc.text("Nume", left, y, { width: nameW });
          doc.text("Semnătura", sigX, y, { width: sigW });
          const ly = y + 16;
          doc.moveTo(left, ly).lineTo(left + width, ly).lineWidth(0.7).strokeColor("#000").stroke();
          doc.y = ly + 4;
        };
        doc.y += 4;
        header();
        for (const row of block.rows) {
          if (doc.y + rowH > bottomLimit()) {
            doc.addPage();
            header();
          }
          const top = doc.y;
          doc.font("Serif").fontSize(BODY_SIZE).fillColor("#000").text(row.name, left, top + 14, { width: nameW, lineBreak: false, ellipsis: true });
          if (row.image) {
            doc.image(Buffer.from(row.image), sigX, top + 2, { fit: [sigW * 0.8, rowH - 16] });
            doc.font("Serif").fontSize(8).fillColor("#555").text(`semnat ${row.signedAt ?? ""}`, sigX, top + rowH - 13, { width: sigW, lineBreak: false });
          } else {
            const ly = top + rowH - 14;
            doc.moveTo(sigX, ly).lineTo(sigX + sigW * 0.8, ly).lineWidth(0.6).strokeColor("#000").stroke();
          }
          doc.moveTo(left, top + rowH).lineTo(left + width, top + rowH).lineWidth(0.3).strokeColor("#999").stroke();
          doc.y = top + rowH + 2;
        }
        doc.x = left;
        doc.y += 10;
        break;
      }
      case "table": {
        // Column widths by content length (header and a sample of rows), 9 pt text, header repeated on new pages.
        const size = Math.min(BODY_SIZE, 9);
        const pad = 3;
        const n = block.columns.length;
        const sample = block.rows.slice(0, 200);
        const weight = block.columns.map((c, i) => Math.min(40, Math.max(c.length, 4, ...sample.map((r) => (r[i] ?? "").length))));
        const sum = weight.reduce((a, b) => a + b, 0) || 1;
        const widths = weight.map((w) => (w / sum) * width);
        const xs = widths.map((_, i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0));
        const rowHeight = (cells: string[], font: string) => {
          doc.font(font).fontSize(size);
          return Math.max(...cells.map((t, i) => doc.heightOfString(t || " ", { width: widths[i] - 2 * pad }))) + 2 * pad;
        };
        const drawRow = (cells: string[], font: string, line: number) => {
          const h = rowHeight(cells, font);
          if (doc.y + h > bottomLimit()) {
            doc.addPage();
            if (font !== "Serif-Bold") drawRow(block.columns, "Serif-Bold", 0.8);
          }
          const y = doc.y;
          doc.font(font).fontSize(size).fillColor("#000");
          for (let i = 0; i < n; i++) doc.text(cells[i] ?? "", xs[i] + pad, y + pad, { width: widths[i] - 2 * pad });
          doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(line).strokeColor(line > 0.5 ? "#000" : "#999").stroke();
          doc.y = y + h;
        };
        drawRow(block.columns, "Serif-Bold", 0.8);
        for (const r of block.rows) drawRow(r, "Serif", 0.3);
        doc.x = left;
        doc.y += 10;
        break;
      }
      case "chart": {
        drawChart(doc, block, left, width, bottomLimit);
        break;
      }
      case "centered": {
        doc.font(block.bold ? "Serif-Bold" : "Serif").fontSize(block.size ?? BODY_SIZE).fillColor("#000");
        doc.text(block.text, left, doc.y, { width, align: "center" });
        doc.y += 12;
        break;
      }
      case "image": {
        const w = Math.min(block.width, width);
        if (doc.y + w > bottomLimit()) doc.addPage();
        doc.image(Buffer.from(block.png), left + (width - w) / 2, doc.y, { width: w });
        doc.x = left;
        doc.y += w + 12;
        break;
      }
      case "signed": {
        // "Secretar, <nume>" / "Pastor, <nume>", then "Semnătura" with room to sign, in two columns.
        const blockHeight = 24 + 2 * BODY_SIZE * LINE_HEIGHT + 40;
        if (doc.y + blockHeight > bottomLimit()) doc.addPage();
        const colW = width * 0.45;
        const top = doc.y + 18;
        const cols: [Signature, number][] = [
          [block.left, left],
          [block.right, left + width - colW],
        ];
        for (const [sig, x] of cols) {
          doc.font("Serif").fontSize(BODY_SIZE).fillColor("#000");
          doc.text(`${sig.label}, ${sig.name}`.replace(/, $/, ","), x, top, { width: colW });
          const sy = top + BODY_SIZE * LINE_HEIGHT + 6;
          doc.text("Semnătura", x, sy, { width: colW });
          const ly = sy + BODY_SIZE * LINE_HEIGHT + 28;
          doc.moveTo(x, ly).lineTo(x + colW * 0.8, ly).lineWidth(0.7).strokeColor("#000").stroke();
        }
        doc.x = left;
        doc.y = top + blockHeight;
        break;
      }
    }
  }

  // Numerotarea paginilor (doar pentru documentele de mai multe pagini) și subsolul (ex. „Proces-verbal închis la …”).
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - MARGIN.bottom / 2 - 5;
    doc.font("Serif").fontSize(9).fillColor("#555");
    if (spec.footer) doc.text(spec.footer, left, y - 12, { width, align: "center", lineBreak: false });
    if (range.count > 1) doc.text(`Pagina ${i + 1} din ${range.count}`, left, y, { width, align: "center", lineBreak: false });
    // A draft or a document awaiting the pastor: a diagonal mark across the page.
    if (spec.watermark) {
      const cx = doc.page.width / 2;
      const cy = doc.page.height / 2;
      doc.save();
      doc.rotate(-35, { origin: [cx, cy] });
      doc.font("Serif-SemiBold").fontSize(34).fillColor("#b03a2e").fillOpacity(0.16);
      doc.text(spec.watermark, cx - 300, cy - 20, { width: 600, align: "center", lineBreak: false });
      doc.restore();
    }
  }
  doc.end();
  return done;
}

/** Nume de fișier sigur (fără diacritice și caractere speciale). */
export function pdfFileName(base: string): string {
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "document"}.pdf`;
}

/** Răspunsul HTTP cu PDF-ul (afișat în browser, cu opțiunea de descărcare). */
export function pdfResponse(pdf: Buffer, fileName: string, download = false, extraHeaders: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}
