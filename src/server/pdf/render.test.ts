import { describe, expect, it } from "vitest";
import { documentPrint, meetingPrint } from "@/domain/print";
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
          titlu: "",
          tip: "Comitet",
          data: "2026-09-18",
          ora: "",
          loc: "",
          presedinte: "",
          invitati: "",
          ordine: lung,
          discutii: "",
          hotarari: "",
          prezenti: [],
        },
        church,
      ),
    );
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  it("nume de fișier fără diacritice", () => {
    expect(pdfFileName("Proces-verbal 2026-09-18 — Ședință")).toBe("proces-verbal-2026-09-18-sedinta.pdf");
    expect(pdfFileName("")).toBe("document.pdf");
  });
});
