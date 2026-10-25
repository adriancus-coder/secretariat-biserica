import { describe, expect, it } from "vitest";
import { isRichEmpty, plainToRich, richLines, richToPlain, type RichDoc } from "./rich-text";
import { checkRich, parseRichJson, richField } from "./schemas/rich-text";

const text = (t: string, ...marks: object[]) => ({ type: "text", text: t, ...(marks.length ? { marks } : {}) });

/** A document with every allowed node and mark, and a nested list. */
const sample = {
  type: "doc",
  content: [
    { type: "paragraph", attrs: { align: "center" }, content: [text("Titlu", { type: "bold" }, { type: "textSize", attrs: { size: "foarteMare" } })] },
    { type: "paragraph", content: [text("Text "), text("înclinat", { type: "italic" }), { type: "hardBreak" }, text("subliniat", { type: "underline" })] },
    {
      type: "orderedList",
      attrs: { start: 1, type: null },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [text("Unu")] }] },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [text("Doi")] },
            { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("doi-a")] }] }] },
          ],
        },
      ],
    },
    { type: "paragraph" },
  ],
} as unknown as RichDoc;

describe("rich text projection", () => {
  it("richToPlain writes paragraphs, line breaks, numbered, bulleted and nested lists", () => {
    expect(richToPlain(sample)).toBe("Titlu\nText înclinat\nsubliniat\n1. Unu\n2. Doi\n   - doi-a");
  });

  it("richLines carries marks, sizes, alignment, markers and levels", () => {
    const lines = richLines(sample);
    expect(lines[0]).toEqual({ runs: [{ text: "Titlu", bold: true, size: "foarteMare" }], align: "center", level: 0 });
    expect(lines[1].runs).toEqual([{ text: "Text " }, { text: "înclinat", italic: true }, { text: "\n" }, { text: "subliniat", underline: true }]);
    expect(lines.slice(2, 5).map((l) => [l.marker, l.level])).toEqual([
      ["1.", 1],
      ["2.", 1],
      ["•", 2],
    ]);
  });

  it("plainToRich makes one paragraph per line and lists from '1. ' and '- ' prefixes; the round trip is exact", () => {
    const plain = "Adeverință\n\nSe adeverește că:\n1. primul\n2. al doilea\n4. separat\n- punct\n- altul\nFinal";
    const doc = plainToRich(plain);
    expect(doc.content.map((b) => b.type)).toEqual(["paragraph", "paragraph", "paragraph", "orderedList", "orderedList", "bulletList", "paragraph"]);
    expect(richToPlain(doc)).toBe(plain);
    expect(checkRich(doc).ok).toBe(true);
    expect(plainToRich("").content).toEqual([{ type: "paragraph" }]);
    expect(isRichEmpty(plainToRich("  \n "))).toBe(true);
  });
});

describe("rich text schema", () => {
  it("accepts every allowed node and mark", () => {
    expect(checkRich(sample)).toEqual({ ok: true, doc: sample });
    expect(parseRichJson(JSON.stringify(sample)).ok).toBe(true);
  });

  it("refuses images, links, HTML, styles, colours and unknown attributes", () => {
    const withBlock = (block: unknown) => ({ type: "doc", content: [block] });
    const bad = [
      withBlock({ type: "image", attrs: { src: "x.png" } }),
      withBlock({ type: "html", content: "<script>alert(1)</script>" }),
      withBlock({ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link", attrs: { href: "https://x" } }] }] }),
      withBlock({ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "textStyle", attrs: { color: "red" } }] }] }),
      withBlock({ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "textSize", attrs: { size: "uriaș" } }] }] }),
      withBlock({ type: "paragraph", attrs: { align: "center", style: "color:red" } }),
      withBlock({ type: "paragraph", attrs: { align: "middle" } }),
      withBlock({ type: "heading", attrs: { level: 1 } }),
      withBlock({ type: "paragraph", content: [{ type: "text", text: "" }] }),
      withBlock({ type: "paragraph", content: [{ type: "text", text: "a", onclick: "x" }] }),
      { type: "doc", content: [] },
      { type: "doc", content: [{ type: "paragraph" }], extra: 1 },
      "<p>text</p>",
      null,
    ];
    for (const value of bad) expect(checkRich(value).ok, JSON.stringify(value)).toBe(false);
    expect(parseRichJson("not json").ok).toBe(false);
  });

  it("refuses a document above 200 KB and lists nested too deep", () => {
    const big = plainToRich("x".repeat(300 * 1024));
    expect(checkRich(big)).toEqual({ ok: false, message: "Textul este prea lung (cel mult 200 KB)." });
    let block: unknown = { type: "paragraph", content: [text("adânc")] };
    for (let i = 0; i < 10; i++) block = { type: "bulletList", content: [{ type: "listItem", content: [block] }] };
    expect(checkRich({ type: "doc", content: [block] }).ok).toBe(false);
  });

  it("richField reads the hidden input: empty is null, invalid is a field error", () => {
    expect(richField.parse("")).toBeNull();
    expect(richField.parse(JSON.stringify(sample))).toEqual(sample);
    expect(richField.safeParse('{"type":"doc","content":[{"type":"image"}]}').success).toBe(false);
  });
});
