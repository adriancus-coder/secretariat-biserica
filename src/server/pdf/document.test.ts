import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT } from "@/lib/page-layout";
import type { ChurchSettings } from "../queries/church";
import { documentSpec } from "./document";
import { renderPdf } from "./render";

const church = {
  nume: "Maranata Stavanger",
  adresa: "",
  orgNr: "",
  telefon: "",
  email: "",
  pastor: "Daniel Mureșan",
  secretar: "Ioana Pop",
  docLayout: { ...DEFAULT_LAYOUT, fontSize: 12 },
} as unknown as ChurchSettings;

const doc = { tip: "adeverinta" as const, nr: 4, data: "2026-02-01", text: "Text", textRich: null, titlu: "" };

describe("document page layout", () => {
  it("uses the document's own layout, else the church's default", async () => {
    expect(documentSpec({ ...doc, layout: null }, church).layout).toMatchObject({ format: "A4", fontSize: 12 });
    const own = documentSpec({ ...doc, layout: { format: "A5", marginLeft: 30, fontSize: 10 } }, church).layout!;
    expect(own).toMatchObject({ format: "A5", marginLeft: 30, fontSize: 10, marginTop: DEFAULT_LAYOUT.marginTop });
    // An unsaved layout (the preview) wins over both.
    expect(documentSpec({ ...doc, layout: { format: "A5" } }, church, { ...DEFAULT_LAYOUT, fontSize: 15 }).layout).toMatchObject({ format: "A4", fontSize: 15 });
  });

  it("the PDF follows it: A5 page and the body size", async () => {
    const pdf = (await renderPdf(documentSpec({ ...doc, layout: { format: "A5", fontSize: 10 } }, church))).toString("latin1");
    expect(pdf).toMatch(/MediaBox \[0 0 419\.53 595\.28\]/);
    const a4 = (await renderPdf(documentSpec({ ...doc, layout: null }, church))).toString("latin1");
    expect(a4).toMatch(/MediaBox \[0 0 595\.28 841\.89\]/);
  });
});
