import { describe, expect, it } from "vitest";
import { printToText } from "@/domain/print";
import { consentFormPrint, PRAYER_FORM_ROWS } from "./consent-form-print";

describe("paper consents form", () => {
  it("has the four consents and the two weekly prayer rows, and nothing about a person", () => {
    const text = printToText(consentFormPrint({ nume: "Maranata", adresa: "", telefon: "", email: "", pastor: "", secretar: "" } as never));
    expect(text).toContain("Rugăciunea săptămânală pentru familii");
    for (const row of PRAYER_FORM_ROWS) expect(text).toContain(`[   ] ${row}`);
    expect(text).toContain("Ziua mea de naștere poate fi anunțată în biserică");
    expect(text).not.toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });
});
