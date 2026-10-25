import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { documentPrint, meetingPrint, printToText } from "@/domain/print";
import { DEFAULT_LAYOUT } from "@/lib/page-layout";
import { richToPlain, type RichDoc } from "@/lib/rich-text";
import { pdfFileName, renderPdf } from "./render";

const church = {
  nume: "Maranata Stavanger",
  adresa: "Kongsgårdbakken 1",
  orgNr: "",
  telefon: "",
  email: "",
  pastor: "Daniel Mureșan",
  secretar: "Ioana Pop",
};

/** Bold + "foarte mare" title (centred), italic, underline, bold italic, and a numbered list with a nested bulleted one. */
const formatted = {
  type: "doc",
  content: [
    { type: "paragraph", attrs: { align: "center" }, content: [{ type: "text", text: "Adeverință", marks: [{ type: "bold" }, { type: "textSize", attrs: { size: "foarteMare" } }] }] },
    {
      type: "paragraph",
      attrs: { align: "right" },
      content: [
        { type: "text", text: "Ioana Pop", marks: [{ type: "bold" }] },
        { type: "text", text: " este ", marks: [{ type: "textSize", attrs: { size: "mic" } }] },
        { type: "text", text: "membră", marks: [{ type: "italic" }] },
        { type: "text", text: " din 2010", marks: [{ type: "underline" }, { type: "textSize", attrs: { size: "mare" } }] },
        { type: "hardBreak" },
        { type: "text", text: "și slujește.", marks: [{ type: "bold" }, { type: "italic" }] },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Unu" }] }] },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Doi" }] },
            { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "doi-a" }] }] }] },
          ],
        },
      ],
    },
  ],
} as unknown as RichDoc;

describe("generarea PDF", () => {
  it("produce un PDF valid, cu fontul încorporat (diacritice)", async () => {
    const pdf = await renderPdf(
      documentPrint({ tip: "adeverinta", nr: 3, data: "2026-02-01", text: "Șușă țâță — „ăîâșț” ✓" }, church),
    );
    const s = pdf.toString("latin1");
    expect(s.startsWith("%PDF-")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("SourceSerif4");
    expect(s).toContain("/FontFile2");
    expect((s.match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
  });

  it("un proces-verbal lung trece pe mai multe pagini", async () => {
    const lung = Array.from({ length: 80 }, (_, i) => `${i + 1}. Punct pe ordinea de zi cu o descriere mai lungă.`).join("\n");
    const pdf = await renderPdf(
      meetingPrint(
        {
          nr: 1,
          tip: "Comitet",
          data: "2026-09-18",
          prezenti: [],
          absenti: [],
          invitati: "",
          ordine: "",
          puncte: Array.from({ length: 80 }, (_, i) => `Punctul ${i + 1}, cu o descriere mai lungă.`),
          observatii: lung,
          formulaIncheiere: "Toate punctele au fost votate în unanimitate de membrii prezenți.",
        },
        church,
      ),
    );
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  it("un proces-verbal cu semnături desenate și închis", async () => {
    const png = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.6 } } }).png().toBuffer();
    const pdf = await renderPdf(
      meetingPrint(
        {
          nr: 3,
          tip: "Comitet",
          data: "2026-09-18",
          prezenti: [{ prenume: "Ioana", nume: "Pop" }, { prenume: "Ion", nume: "Popescu" }],
          absenti: [],
          invitati: "",
          ordine: "",
          puncte: ["Un punct"],
          observatii: "",
          formulaIncheiere: "Gata.",
          semnaturi: [
            { name: "Ioana Pop", image: new Uint8Array(png), signedAt: "18.09.2026 19:00" },
            { name: "Ion Popescu", image: null, signedAt: null },
          ],
          inchisLa: "18.09.2026 20:00",
        },
        church,
      ),
    );
    const s = pdf.toString("latin1");
    expect(s.startsWith("%PDF-")).toBe(true);
    expect((s.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("nume de fișier fără diacritice", () => {
    expect(pdfFileName("Proces-verbal 2026-09-18 — Ședință")).toBe("proces-verbal-2026-09-18-sedinta.pdf");
    expect(pdfFileName("")).toBe("document.pdf");
  });

  it("follows the page layout: A5, no letterhead, other margins", async () => {
    const layout = { ...DEFAULT_LAYOUT, format: "A5" as const, letterhead: false, marginTop: 35, fontSize: 11 };
    const spec = { ...documentPrint({ tip: "scrisoare", nr: 1, data: "2026-02-01", text: "Text" }, church), layout };
    const s = (await renderPdf(spec)).toString("latin1");
    expect(s).toMatch(/MediaBox \[0 0 419\.53 595\.28\]/);
    const withHead = (await renderPdf({ ...spec, layout: { ...layout, letterhead: true } })).toString("latin1");
    // Without the letterhead the church name is not drawn (the PDF is smaller).
    expect(s.length).toBeLessThan(withHead.length);
  });
});

/** Every content stream of a PDF, inflated. */
function pdfContent(pdf: Buffer): string {
  const s = pdf.toString("latin1");
  const out: string[] = [];
  for (const m of s.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      out.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
    } catch {
      // font files and images
    }
  }
  return out.join("\n");
}

describe("rich text in the PDF", () => {
  const spec = documentPrint({ tip: "adeverinta", nr: 3, data: "2026-02-01", text: "", textRich: formatted }, church);

  it("printToText shows each mark, the alignment and the nested lists", () => {
    expect(printToText(spec, { marks: true }).split("\n").slice(3)).toEqual([
      "[centru] **{foarteMare:Adeverință}**",
      "[dreapta] **Ioana Pop**{mic: este }_membră___{mare: din 2010}__",
      "**_și slujește._**",
      "1. Unu",
      "2. Doi",
      "   • doi-a",
      "Pastor: Daniel Mureșan | Secretar: Ioana Pop",
    ]);
    // Without marks: the same text as the plain projection.
    expect(printToText(spec).split("\n").slice(3, 9).join("\n")).toBe(richToPlain(formatted).replace("- doi-a", "• doi-a"));
  });

  it("draws bold, italic and bold italic glyphs, the sizes, the centred title, underlines and list numbers", async () => {
    const pdf = await renderPdf(spec);
    const fonts = pdf.toString("latin1").match(/\/BaseFont \/[A-Z]+\+(\S+)/g)?.map((f) => f.split("+")[1]) ?? [];
    expect(new Set(fonts)).toEqual(new Set(["SourceSerif4-SemiBold", "SourceSerif4-Regular", "SourceSerif4-Bold", "SourceSerif4-Italic", "SourceSerif4-BoldIt"]));
    const content = pdfContent(pdf);
    // Base 13 pt: mic 11, mare 16, foarte mare 19.
    for (const size of [11, 13, 16, 19]) expect(content).toMatch(new RegExp(`/F\\d+ ${size} Tf`));
    // The centred title starts well right of the left margin (56.69 pt), the right-aligned line further still.
    const xs = [...content.matchAll(/1 0 0 1 ([\d.]+) [\d.]+ Tm\n\/F\d+ 19 Tf/g)].map((m) => Number(m[1]));
    expect(xs[0]).toBeGreaterThan(200);
    // Underline: one more filled rectangle than without it.
    const plainRuns = { ...formatted, content: formatted.content.map((b) => JSON.parse(JSON.stringify(b).replaceAll('{"type":"underline"},', ""))) };
    const without = pdfContent(await renderPdf(documentPrint({ tip: "adeverinta", nr: 3, data: "2026-02-01", text: "", textRich: plainRuns }, church)));
    const rects = (t: string) => (t.match(/ re\n/g) ?? []).length + (t.match(/ l\n/g) ?? []).length;
    expect(rects(content)).toBeGreaterThan(rects(without));
  });

  it("numbers the minutes' rich points and keeps plain ones", () => {
    const m = meetingPrint(
      {
        nr: 4,
        tip: "Comitet",
        data: "2026-09-11",
        prezenti: [],
        absenti: [],
        invitati: "",
        ordine: "",
        puncte: ["Unu", "Doi"],
        puncteRich: [null, formatted],
        observatii: "Centrat",
        observatiiRich: { type: "doc", content: [{ type: "paragraph", attrs: { align: "center" }, content: [{ type: "text", text: "Centrat" }] }] },
        formulaIncheiere: "Gata.",
      },
      church,
    );
    const lines = printToText(m, { marks: true }).split("\n");
    expect(lines).toContain("1. Unu");
    expect(lines).toContain("2. [centru] **{foarteMare:Adeverință}**");
    expect(lines).toContain("   2. Doi");
    expect(lines).toContain("      • doi-a");
    expect(lines).toContain("[centru] Centrat");
  });
});
