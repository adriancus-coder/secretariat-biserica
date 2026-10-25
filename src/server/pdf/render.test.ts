import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { documentPrint, meetingPrint } from "@/domain/print";
import { DEFAULT_LAYOUT } from "@/lib/page-layout";
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
