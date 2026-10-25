import mammoth from "mammoth";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseMinutesText } from "@/domain/minutes-parse";
import { documentPrint, meetingPrint, printApplicationPoster } from "@/domain/print";
import JSZip from "jszip";
import { DEFAULT_LAYOUT } from "@/lib/page-layout";
import type { RichDoc } from "@/lib/rich-text";
import { renderDocx } from "./render";

const church = {
  nume: "Maranata Stavanger",
  adresa: "Kongsgårdbakken 1",
  orgNr: "912 345 678",
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

/** The paragraphs of a .docx as plain text (mammoth reads it the way the Word import does). */
async function docxLines(docx: Buffer): Promise<string[]> {
  const { value } = await mammoth.extractRawText({ buffer: docx });
  return value.split("\n").map((l) => l.trim()).filter(Boolean);
}

describe("Word (.docx) generation", () => {
  it("the minutes have the same content as the PDF, in order, with diacritics", async () => {
    const signature = new Uint8Array(await sharp({ create: { width: 300, height: 100, channels: 3, background: "#fff" } }).png().toBuffer());
    const p = (prenume: string, nume: string) => ({ prenume, nume });
    const spec = meetingPrint(
      {
        nr: 16,
        tip: "Comitet",
        data: "2026-09-11",
        prezenti: [p("Mihai", "Ionescu"), p("Petru", "Ștefănescu")],
        absenti: [],
        semnaturi: [
          { name: "Mihai Ionescu", image: signature, signedAt: "11.09.2026 19:42" },
          { name: "Petru Ștefănescu", image: null, signedAt: null },
        ],
        invitati: "",
        ordine: "",
        puncte: ["Ziua Recoltei va avea loc pe 4 octombrie.", "Conferința tinerilor se amână."],
        observatii: "Rând unu\nRând doi",
        formulaIncheiere: "Toate punctele au fost votate în unanimitate de membrii prezenți.",
        inchisLa: "11.09.2026 20:00",
      },
      church,
    );
    const docx = await renderDocx(spec);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    const text = await docxLines(docx);
    const expected = [
      "Biserica Maranata Stavanger",
      "Kongsgårdbakken 1 · Org.nr. 912 345 678",
      "Proces verbal nr. 16",
      "Încheiat azi, 11.09.2026, cu ocazia ședinței de comitet.",
      "La ședință au fost prezenți: 2 membri.",
      "Mihai Ionescu, Petru Ștefănescu",
      "Nume",
      "Semnătura",
      "Mihai Ionescu",
      "semnat 11.09.2026 19:42",
      "Petru Ștefănescu",
      "În cadrul ședinței s-au discutat și aprobat următoarele:",
      "1.\tZiua Recoltei va avea loc pe 4 octombrie.",
      "2.\tConferința tinerilor se amână.",
      "Observații:",
      "Rând unu",
      "Rând doi",
      "Toate punctele au fost votate în unanimitate de membrii prezenți.",
      "Întocmit,",
      "Secretar, Ioana Pop",
      "Semnătura",
      "Pastor, Daniel Mureșan",
      "Semnătura",
    ];
    expect(text).toEqual(expected);
    // The Word import reads the file back (number, date, type, attendees, points).
    const { value } = await mammoth.extractRawText({ buffer: docx });
    const back = parseMinutesText(value).draft;
    expect(back).toMatchObject({ nr: 16, data: "2026-09-11", prezenti: ["Mihai Ionescu", "Petru Ștefănescu"] });
    expect(back.puncte.slice(0, 2)).toEqual(["Ziua Recoltei va avea loc pe 4 octombrie.", "Conferința tinerilor se amână."]);
    // The drawn signature is embedded as an image.
    expect(docx.includes(Buffer.from("word/media/"))).toBe(true);
  });

  it("an A5 page size is kept (the application poster)", async () => {
    const png = new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000" } }).png().toBuffer());
    const docx = await renderDocx(printApplicationPoster(church, "https://x.org/cerere/m", png));
    expect(await docxLines(docx)).toContain("Cerere de membru online");
  });

  it("follows the page layout: A5, margins, text size, no letterhead", async () => {
    const spec = meetingPrint(
      { nr: 2, tip: "Comitet", data: "2026-09-11", prezenti: [], absenti: [], invitati: "", ordine: "", puncte: ["Unu"], observatii: "", formulaIncheiere: "Gata." },
      church,
    );
    const docx = await renderDocx({ ...spec, layout: { ...DEFAULT_LAYOUT, format: "A5", marginTop: 35, fontSize: 11, letterhead: false, align: "left" } });
    const lines = await docxLines(docx);
    expect(lines[0]).toBe("Proces verbal nr. 2");
    const xml = (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string");
    const doc = await xml;
    expect(doc).toContain('<w:pgSz w:w="8390"'); // 148 mm
    expect(doc).toContain('w:top="1984"'); // 35 mm
    expect(doc).toContain('<w:sz w:val="22"/>'); // 11 pt
    expect(doc).not.toContain('w:jc w:val="both"');
  });
});

describe("rich text in Word", () => {
  it("renders the same runs, sizes, alignment and lists; mammoth reads the text back", async () => {
    const spec = documentPrint({ tip: "adeverinta", nr: 3, data: "2026-02-01", text: "", textRich: formatted }, church);
    const docx = await renderDocx(spec);
    const lines = await docxLines(docx);
    // mammoth ignores <w:br/>, so the two lines of the second paragraph read as one (checked in the XML below).
    expect(lines).toEqual(expect.arrayContaining(["Adeverință", "Ioana Pop este membră din 2010și slujește.", "1.\tUnu", "2.\tDoi", "•\tdoi-a"]));
    const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string");
    // The rich text starts at its own "Adeverință" (the heading above it says the same; signatures repeat names).
    const body = xml.slice(xml.lastIndexOf("<w:p>", xml.lastIndexOf(">Adeverință</w:t>")));
    const run = (t: string) => {
      const i = body.indexOf(`>${t}</w:t>`);
      return body.slice(body.lastIndexOf("<w:r>", i), i);
    };
    // Base 12 pt (24 half-points): foarte mare 18 pt, mic 10 pt, mare 15 pt.
    expect(run("Adeverință")).toMatch(/<w:b\/>[\s\S]*<w:sz w:val="36"\/>/);
    expect(run("Ioana Pop")).toContain("<w:b/>");
    expect(run(" este ")).toContain('<w:sz w:val="20"/>');
    expect(run("membră")).toContain("<w:i/>");
    expect(run(" din 2010")).toMatch(/<w:sz w:val="30"\/>[\s\S]*<w:u w:val="single"\/>|<w:u w:val="single"\/>[\s\S]*<w:sz w:val="30"\/>/);
    expect(run("și slujește.")).toMatch(/<w:b\/>[\s\S]*<w:i\/>/);
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain('<w:jc w:val="right"/>');
    // The line break inside the paragraph is a Word line break.
    expect(xml).toContain("<w:br/>");
    // The nested bullet is indented one more level (16 mm) than the numbered items (8 mm).
    expect(xml).toContain('w:left="453"');
    expect(xml).toContain('w:left="906"');
  });

  it("the Word import recovers the minutes' rich points", async () => {
    const point = (t: string, bold = false) =>
      ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, ...(bold ? { marks: [{ type: "bold" }] } : {}) }] }] }) as RichDoc;
    const spec = meetingPrint(
      {
        nr: 7,
        tip: "Comitet",
        data: "2026-09-11",
        prezenti: [],
        absenti: [],
        invitati: "",
        ordine: "",
        puncte: ["Ziua Recoltei pe 4 octombrie.", "Conferința se amână."],
        puncteRich: [point("Ziua Recoltei pe 4 octombrie.", true), point("Conferința se amână.")],
        observatii: "",
        formulaIncheiere: "Toate punctele au fost votate în unanimitate de membrii prezenți.",
      },
      church,
    );
    const { value } = await mammoth.extractRawText({ buffer: await renderDocx(spec) });
    expect(parseMinutesText(value).draft.puncte).toEqual(["Ziua Recoltei pe 4 octombrie.", "Conferința se amână."]);
  });
});
