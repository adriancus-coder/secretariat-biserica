import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { privacyBlocks, privacyTemplate } from "./privacy";
import { PRIVACY_NOTICE_1_2 } from "./privacy-notice";

describe("privacy notice 1.2", () => {
  it("is identical to docs/privacy-notice-1.2.md", () => {
    const file = readFileSync(new URL("../../docs/privacy-notice-1.2.md", import.meta.url), "utf8");
    expect(PRIVACY_NOTICE_1_2).toBe(file.replace(/\n$/, ""));
  });

  it("names only Render and Resend as providers and no AI service", () => {
    const t = privacyTemplate({ nume: "Maranata Stavanger", email: "s@x.no", adresa: "" });
    expect(t).not.toMatch(new RegExp(["anth" + "ropic", "cla" + "ude"].join("|"), "i"));
    expect(t).toContain("Render Services, Inc. și Resend, Inc. au sediul în Statele Unite ale Americii.");
    expect(t).toContain("Biserica nu folosește servicii de inteligență artificială pentru prelucrarea datelor persoanelor.");
  });

  it("fills the church's details; an empty setting keeps its placeholder", () => {
    const t = privacyTemplate({
      nume: "Betel Oslo",
      email: "post@betel.no",
      adresa: "Storgata 1, Oslo",
      orgNr: "998 877 665",
      telefon: "+47 22 00 00 00",
      comunitate: "Comunitatea Penticostală Nord",
      privacyAdoptedAt: "2026-11-01",
    });
    expect(t).toContain("Biserica Penticostală Betel Oslo\nVersiunea 1.2 — în vigoare de la 1 noiembrie 2026");
    expect(t).toContain("Operatorul datelor este Biserica Penticostală Betel Oslo, Storgata 1, Oslo, organisasjonsnummer 998 877 665");
    expect(t).toContain("Cultului Creștin Penticostal, Comunitatea Penticostală Nord, denumită");
    expect(t).toContain("la post@betel.no sau +47 22 00 00 00");
    expect(t).not.toMatch(/\[(adresa|nr\.|e-mail|telefon|data)\]|Maranata/);
    const empty = privacyTemplate({ nume: "", email: "", adresa: "" });
    expect(empty).toContain("Biserica [numele bisericii], [adresa], organisasjonsnummer [nr.]");
    expect(empty).toContain("[Comunitatea de care aparține biserica]");
    expect(empty).toContain("în vigoare de la [data]");
  });

  it("reads the 1.2 model line by line: numbered headings, list items, paragraphs", () => {
    const blocks = privacyBlocks(privacyTemplate({ nume: "Maranata Stavanger", email: "", adresa: "" }));
    expect(blocks[0]).toEqual({ type: "h", text: "NOTĂ DE INFORMARE PRIVIND PRELUCRAREA DATELOR CU CARACTER PERSONAL" });
    expect(blocks).toContainEqual({ type: "h", text: "1. Cine suntem" });
    expect(blocks).toContainEqual({ type: "h", text: "9. Modificarea acestei note" });
    expect(blocks).toContainEqual({ type: "li", text: "anunțarea zilei de naștere în biserică;" });
    expect(blocks.filter((b) => b.type === "h")).toHaveLength(10);
  });

  it("keeps the older format: ## headings and paragraphs joined until a blank line", () => {
    expect(privacyBlocks("## A\nunu\ndoi\n\ntrei")).toEqual([
      { type: "h", text: "A" },
      { type: "p", text: "unu doi" },
      { type: "p", text: "trei" },
    ]);
  });
});
