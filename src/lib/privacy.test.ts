import { describe, expect, it } from "vitest";
import { privacyBlocks, privacyTemplate, publicPrivacyText } from "./privacy";

describe("privacy notice", () => {
  it("fills the church's name and contact", () => {
    const t = privacyTemplate({ nume: "Maranata Stavanger", email: "post@maranata.no", adresa: "Stavanger" });
    expect(t).toContain("Biserica Maranata Stavanger, cu sediul în Stavanger, este operatorul");
    expect(t).toContain("post@maranata.no");
    expect(privacyTemplate({ nume: "", email: "", adresa: "" })).toContain("[adresa de e-mail a bisericii]");
  });
  it("splits headings and paragraphs", () => {
    expect(privacyBlocks("## A\nunu\ndoi\n\ntrei")).toEqual([
      { type: "h", text: "A" },
      { type: "p", text: "unu doi" },
      { type: "p", text: "trei" },
    ]);
  });

  it("adds the automated-reading paragraph only while extraction is on", () => {
    const text = privacyTemplate({ nume: "Maranata", email: "s@x.no", adresa: "" });
    expect(publicPrivacyText(text, false)).toBe(text);
    const on = publicPrivacyText(text, true);
    expect(on.startsWith(text)).toBe(true);
    expect(on).toContain("## Citirea automată a documentelor");
    expect(on).toContain("Anthropic (Statele Unite ale Americii)");
    expect(on).toContain("nu le păstrează");
    expect(privacyBlocks(on).at(-2)).toEqual({ type: "h", text: "Citirea automată a documentelor" });
  });
});
