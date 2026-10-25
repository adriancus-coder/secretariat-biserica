import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { PrintSpec, Signature } from "@/domain/print";
import { DEFAULT_LAYOUT } from "@/lib/page-layout";
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
};

/** Linia de detalii din antet: adresă · Org.nr. · telefon · e-mail. */
export function letterheadDetails(c: ChurchInfo): string {
  return [c.adresa, c.orgNr ? `Org.nr. ${c.orgNr}` : "", c.telefon, c.email].filter(Boolean).join(" · ");
}

export async function renderPdf(spec: PrintSpec): Promise<Buffer> {
  // Page layout: the spec's (minutes), else the defaults; `size` alone is used by the poster.
  const layout = spec.layout ?? { ...DEFAULT_LAYOUT, format: spec.size ?? DEFAULT_LAYOUT.format };
  const MARGIN = { top: layout.marginTop * MM, bottom: layout.marginBottom * MM, left: layout.marginLeft * MM, right: layout.marginRight * MM };
  const BODY_SIZE = layout.fontSize;
  const LINE_HEIGHT = layout.lineHeight;
  const doc = new PDFDocument({
    size: layout.format,
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
        // pdfkit pierde spațiul de la începutul unui fragment continuat: îl mutăm la finalul celui anterior.
        const runs = block.runs
          .filter((r) => r.text !== "")
          .map((r) => ({ ...r }))
          .map((r, i, all) => {
            if (i > 0 && /^\s/.test(r.text)) {
              all[i - 1].text += " ";
              r.text = r.text.replace(/^\s+/, "");
            }
            return r;
          })
          .filter((r) => r.text !== "");
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
      case "list": {
        const gap = lineGap(BODY_SIZE);
        const indent = 18;
        block.items.forEach((item, i) => {
          doc.font("Serif").fontSize(BODY_SIZE);
          const marker = block.ordered ? `${i + 1}.` : "•";
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
          doc.moveTo(x, ly).lineTo(x + colW, ly).lineWidth(1).strokeColor("#000").stroke();
          doc.fontSize(11).text(sig.name || " ", x, ly + 4, { width: colW, align: "center" });
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
