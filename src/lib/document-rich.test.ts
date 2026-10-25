import { describe, expect, it } from "vitest";
import { parseDocumentExtras } from "./document-backup";
import { plainToRich, type RichDoc } from "./rich-text";
import { documentSchema } from "./schemas/document";

const adeverinta: RichDoc = {
  type: "doc",
  content: [
    { type: "paragraph", attrs: { align: "center" }, content: [{ type: "text", text: "ADEVERINȚĂ", marks: [{ type: "bold" }] }] },
    { type: "paragraph", content: [{ type: "text", text: "Se adeverește că " }, { type: "text", text: "Ioana Pop", marks: [{ type: "bold" }] }, { type: "text", text: " este membră." }] },
  ],
};

const form = (extra: Record<string, string>) => ({ tip: "adeverinta", data: "2026-02-01", ...extra });

describe("documents with rich text", () => {
  it("text becomes the plain projection of the editor's document", () => {
    const r = documentSchema.parse(form({ text: "ignored", textRich: JSON.stringify(adeverinta) }));
    expect(r.text).toBe("ADEVERINȚĂ\nSe adeverește că Ioana Pop este membră.");
    expect(r.textRich).toEqual(adeverinta);
  });

  it("an empty editor is 'Conținutul lipsește.'; disallowed nodes are refused", () => {
    expect(documentSchema.safeParse(form({ textRich: JSON.stringify(plainToRich("")) })).error?.issues[0]).toMatchObject({ path: ["text"], message: "Conținutul lipsește." });
    const html = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { fontFamily: "Comic Sans" } }] }] }] };
    expect(documentSchema.safeParse(form({ textRich: JSON.stringify(html) })).error?.issues[0].path).toEqual(["textRich"]);
  });

  it("without a rich document the plain text works as before", () => {
    expect(documentSchema.parse(form({ text: "Text" }))).toMatchObject({ text: "Text", textRich: null });
    expect(documentSchema.safeParse(form({ text: "" })).success).toBe(false);
  });

  it("backup: valid, non-empty rich documents are read; others are ignored", () => {
    const x = parseDocumentExtras({ documents: { d1: { id: "d1", textRich: adeverinta }, d2: { id: "d2", textRich: { type: "doc", content: [{ type: "image" }] } }, d3: { id: "d3", textRich: plainToRich(" ") } } });
    expect([...x.keys()]).toEqual(["d1"]);
    const l = parseDocumentExtras({ documents: { d4: { id: "d4", asezare: { format: "A5", marginTop: 99, fontSize: 11 } } } }).get("d4");
    // Out-of-range values fall back to the standard layout.
    expect(l?.asezare).toMatchObject({ format: "A5", fontSize: 11, marginTop: 22 });
  });
});
