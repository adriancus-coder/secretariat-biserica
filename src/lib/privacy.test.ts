import { describe, expect, it } from "vitest";
import { privacyBlocks, privacyTemplate } from "./privacy";

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
});
