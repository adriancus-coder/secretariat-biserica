import { describe, expect, it } from "vitest";
import { documentPrint, printToText } from "@/domain/print";
import { freshSignatureRequired, signatureNote } from "@/lib/signatures";

const church = { nume: "Maranata", adresa: "", orgNr: "", telefon: "", email: "", pastor: "Daniel Mureșan", secretar: "Ioana Pop" };

describe("document signatures", () => {
  it("'drawn each time': off, all documents or the chosen types", () => {
    expect(freshSignatureRequired({ semnaturaUnica: "", semnaturaUnicaTipuri: ["botez"] }, "botez")).toBe(false);
    expect(freshSignatureRequired({ semnaturaUnica: "TOATE", semnaturaUnicaTipuri: [] }, "adeverinta")).toBe(true);
    expect(freshSignatureRequired({ semnaturaUnica: "TIPURI", semnaturaUnicaTipuri: ["botez"] }, "botez")).toBe(true);
    expect(freshSignatureRequired({ semnaturaUnica: "TIPURI", semnaturaUnicaTipuri: ["botez"] }, "adeverinta")).toBe(false);
  });
  it("prints the image, the signer and 'semnat la …' (+ device confirmation for a saved one)", () => {
    const at = new Date("2026-10-25T12:03:00Z");
    expect(signatureNote({ mode: "SALVATA", signedAt: at })).toMatch(/^semnat la 25\.10\.2026 \d\d:03 · confirmat pe dispozitivul titularului$/);
    expect(signatureNote({ mode: "UNICA", signedAt: at })).not.toMatch(/dispozitiv/);
    const spec = documentPrint(
      { tip: "adeverinta", nr: 7, data: "2026-10-25", text: "Text.", signatures: { PASTOR: { name: "Ion Pastor", image: new Uint8Array([1]), note: "semnat la 25.10.2026 15:03 · confirmat pe dispozitivul titularului" } } },
      church,
    );
    expect(printToText(spec).split("\n").at(-1)).toBe("Pastor: Ion Pastor [semnătură] (semnat la 25.10.2026 15:03 · confirmat pe dispozitivul titularului) | Secretar: Ioana Pop");
  });
});
