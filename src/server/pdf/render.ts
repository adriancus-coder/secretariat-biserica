import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { PrintSpec, Signature } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";

/**
 * Generarea PDF-urilor pe server (pdfkit), reproducând macheta de tipărire din prototip:
 * antetul bisericii subliniat, numărul de înregistrare aliniat la dreapta, titlul centrat cu
 * majuscule, paragrafe justificate (cu păstrarea rândurilor) și semnăturile pe două coloane.
 */

const MM = 72 / 25.4;
const MARGIN = { top: 22 * MM, bottom: 22 * MM, left: 20 * MM, right: 20 * MM };
const BODY_SIZE = 13;
const LINE_HEIGHT = 1.55;

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
  const doc = new PDFDocument({
    size: "A4",
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

  /** Distanța suplimentară între rânduri pentru o înălțime de rând de 1,55. */
  const lineGap = (size: number) => {
    doc.fontSize(size);
    return Math.max(0, size * LINE_HEIGHT - doc.currentLineHeight());
  };

  // Antetul bisericii
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

  for (const block of spec.blocks) {
    switch (block.type) {
      case "nr": {
        doc.font("Serif").fontSize(BODY_SIZE).text(block.text, left, doc.y, { width, align: "right" });
        doc.y += 18;
        break;
      }
      case "title": {
        doc.font("Serif-SemiBold").fontSize(17);
        doc.text(block.text.toLocaleUpperCase("ro-RO"), left, doc.y, {
          width,
          align: "center",
          characterSpacing: 17 * 0.06,
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
            align: "justify",
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
    }
  }

  // Numerotarea paginilor (doar pentru documentele de mai multe pagini).
  const range = doc.bufferedPageRange();
  if (range.count > 1) {
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const y = doc.page.height - MARGIN.bottom / 2 - 5;
      doc.font("Serif").fontSize(9).fillColor("#555");
      doc.text(`Pagina ${i + 1} din ${range.count}`, left, y, { width, align: "center", lineBreak: false });
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
export function pdfResponse(pdf: Buffer, fileName: string, download = false): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
