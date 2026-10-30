import { readFileSync } from "node:fs";
import mammoth from "mammoth";
import { AlignmentType, Document, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { describe, expect, it } from "vitest";
import { parseMinutesParas, parseMinutesText } from "@/domain/minutes-parse";
import { docxParas } from "./minutes-import";

/*
 * MINUTES-IMPORT-ROBUST: synthetic Word files (built here with the `docx` package, no real names) read
 * the way the import reads them (mammoth's HTML → paragraphs → parser).
 */

type Item = string | { li: string; kind?: "ol" | "ul" } | { table: string[][] };

async function docx(items: Item[]): Promise<Buffer> {
  const children = items.map((it) => {
    if (typeof it === "string") return new Paragraph({ children: [new TextRun(it)] });
    if ("li" in it) return new Paragraph({ children: [new TextRun(it.li)], numbering: { reference: it.kind === "ul" ? "bullets" : "points", level: 0 } });
    return new Table({ rows: it.table.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph(c)] })) })) });
  });
  const doc = new Document({
    numbering: {
      config: [
        { reference: "points", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT }] },
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT }] },
      ],
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

const parse = async (items: Item[]) => parseMinutesParas(await docxParas(await docx(items)));

const HEAD = ["Proces verbal nr. 7", "Încheiat azi, 12.03.2025, cu ocazia ședinței de comitet.", "La ședință au fost prezenți: Ana Pop, Ion Rusu, Maria Dan"];
const END = ["Toate punctele au fost votate în unanimitate de membrii prezenți.", "Întocmit,", "Secretar, Ion Rusu", "Pastor, Ana Pop"];

describe("MINUTES-IMPORT-ROBUST: the points, whatever the structure", () => {
  it("points numbered by Word, each with its vote line", async () => {
    const { draft } = await parse([
      ...HEAD,
      "În cadrul ședinței s-au discutat și aprobat următoarele:",
      { li: "Bugetul pe anul 2025" },
      "Votat: pentru 3, contra 0, abțineri 0",
      { li: "Reparația acoperișului" },
      "Votat: pentru 2, contra 1, abțineri 0",
      ...END,
    ]);
    expect(draft).toMatchObject({ nr: 7, data: "2025-03-12", tip: "comitet", prezenti: ["Ana Pop", "Ion Rusu", "Maria Dan"] });
    expect(draft.puncte).toEqual(["Bugetul pe anul 2025", "Reparația acoperișului"]);
    expect(draft.voturi).toEqual([
      { pentru: 3, contra: 0, abtineri: 0, secret: false },
      { pentru: 2, contra: 1, abtineri: 0, secret: false },
    ]);
    expect(draft.formulaIncheiere).toBe("Toate punctele au fost votate în unanimitate de membrii prezenți.");
    expect(draft.nerecunoscut).toEqual([]);
  });

  it("points numbered by hand: „1.”, „2)”, „a)”, „Pct. 4”, a dash, a bullet", async () => {
    const { draft } = await parse([...HEAD, "PUNCTE DISCUTATE:", "1. Unu", "2) Doi", "a) Trei", "Pct. 4 Patru", "- Cinci", "• Șase", ...END]);
    expect(draft.puncte).toEqual(["Unu", "Doi", "Trei", "Patru", "Cinci", "Șase"]);
  });

  it("bulleted Word lists", async () => {
    const { draft } = await parse([...HEAD, "S-au discutat:", { li: "Curățenia", kind: "ul" }, { li: "Corul", kind: "ul" }, ...END]);
    expect(draft.puncte).toEqual(["Curățenia", "Corul"]);
  });

  it("points in a table: nr | text | vot, with a header row; and in a one-column table", async () => {
    const two = await parse([
      ...HEAD,
      "Hotărâri",
      { table: [["Nr.", "Punct", "Vot"], ["1", "Bugetul", "pentru 3, contra 0, abțineri 0"], ["2", "Excursia tinerilor", "pentru 2, contra 0, abțineri 1"]] },
      ...END,
    ]);
    expect(two.draft.puncte).toEqual(["Bugetul", "Excursia tinerilor"]);
    expect(two.draft.voturi[1]).toEqual({ pentru: 2, contra: 0, abtineri: 1, secret: false });
    const one = await parse([...HEAD, "Puncte discutate", { table: [["Bugetul"], ["Corul"]] }, ...END]);
    expect(one.draft.puncte).toEqual(["Bugetul", "Corul"]);
  });

  it("section headings in many forms, with or without diacritics", async () => {
    for (const heading of ["Puncte discutate:", "S-au discutat", "S-a hotărât:", "HOTARARI", "Hotărâri:", "În cadrul ședinței s-au discutat și aprobat următoarele:", "in cadrul sedintei s-au discutat si aprobat urmatoarele"]) {
      const { draft } = await parse([...HEAD, heading, "1. Bugetul", "2. Corul", ...END]);
      expect(draft.puncte, heading).toEqual(["Bugetul", "Corul"]);
    }
  });

  it("„Ordinea de zi” alone gives the points; followed by „S-a hotărât” it is the agenda", async () => {
    const alone = await parse([...HEAD, "Ordinea de zi:", "1. Bugetul", "2. Corul", ...END]);
    expect(alone.draft.puncte).toEqual(["Bugetul", "Corul"]);
    const both = await parse([...HEAD, "Ordinea de zi:", "1. Bugetul", "2. Corul", "S-a hotărât:", "1. Bugetul se aprobă", "Votat: pentru 3, contra 0, abțineri 0", "2. Corul cântă duminica", ...END]);
    expect(both.draft.ordine).toEqual(["Bugetul", "Corul"]);
    expect(both.draft.puncte).toEqual(["Bugetul se aprobă", "Corul cântă duminica"]);
    expect(both.draft.voturi[0]?.pentru).toBe(3);
  });

  it("a paragraph without a number continues the point before it; the closing and „Întocmit” are not points", async () => {
    const { draft, parts } = await parse([...HEAD, "S-au discutat:", "1. Bugetul", "Se propune o sumă mai mare pentru tineret.", "2. Corul", ...END]);
    expect(draft.puncte).toEqual(["Bugetul\nSe propune o sumă mai mare pentru tineret.", "Corul"]);
    expect(draft.puncte.join(" ")).not.toMatch(/Întocmit|unanimitate/);
    expect(parts.filter((p) => p.kind === "semnaturi").map((p) => p.text)).toEqual(["Întocmit,", "Secretar, Ion Rusu", "Pastor, Ana Pop"]);
    expect([draft.secretar, draft.pastor]).toEqual(["Ion Rusu", "Ana Pop"]);
  });

  it("nothing is lost: every paragraph is taken by a field or listed as unrecognized, in order", async () => {
    const items: Item[] = [
      "Biserica Penticostală Exemplu",
      ...HEAD,
      "Fratele moderator a deschis ședința cu rugăciune.",
      "Absenți: Vasile Ion",
      "S-au discutat:",
      { li: "Bugetul" },
      "Votat: pentru 3, contra 0, abțineri 0",
      { table: [["2", "Corul"]] },
      ...END,
      "Notă: procesul-verbal a fost citit în ședința următoare.",
    ];
    const buffer = await docx(items);
    const paras = await docxParas(buffer);
    const { draft, parts } = parseMinutesParas(paras);
    const squash = (s: string) => s.replace(/\s+/g, "");
    // The document's text = the paragraphs taken by the fields + the unrecognized ones (spaces aside).
    expect(squash(parts.map((p) => p.text).join(""))).toBe(squash(paras.map((p) => p.text).join("")));
    expect(parts[0].kind).toBe("antet");
    expect(draft.nerecunoscut).toEqual(["Fratele moderator a deschis ședința cu rugăciune.", "Notă: procesul-verbal a fost citit în ședința următoare."]);
    expect(draft.absenti).toEqual(["Vasile Ion"]);
    expect(draft.puncte).toEqual(["Bugetul", "Corul"]);
    // And the raw text of the file (mammoth) has no word the paragraphs miss.
    const raw = (await mammoth.extractRawText({ buffer })).value;
    expect(squash(raw)).toBe(squash(paras.map((p) => p.text).join("")));
  });

  it("the church's samples read the same as before through the new reader", async () => {
    for (const file of ["proces-verbal-nr-16.docx", "proces-verbal-gol.docx"]) {
      const buffer = readFileSync(`docs/samples/${file}`);
      const viaHtml = parseMinutesParas(await docxParas(buffer)).draft;
      const viaText = parseMinutesText((await mammoth.extractRawText({ buffer })).value).draft;
      expect(viaHtml, file).toEqual(viaText);
    }
    const nr16 = parseMinutesParas(await docxParas(readFileSync("docs/samples/proces-verbal-nr-16.docx"))).draft;
    expect(nr16.puncte).toHaveLength(5);
    expect(nr16.nerecunoscut).toEqual([]);
  });
});
