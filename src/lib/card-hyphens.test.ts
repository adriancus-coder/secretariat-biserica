import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** CARD-HYPHENS: the figures' labels never get automatic hyphens („evi-dență”) and stay readable. */
describe("CARD-HYPHENS", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  it("no automatic hyphenation anywhere in the stylesheet", () => {
    expect(css).not.toMatch(/hyphens:\s*auto/);
  });
  it("the card label: break between words only, never under 13 px", () => {
    const rule = css.match(/\n {2}\.stat span \{([^}]*)\}/)![1];
    expect(rule).toContain("hyphens: manual");
    expect(rule).toContain("overflow-wrap: break-word");
    expect(rule).toMatch(/font-size: clamp\(13px,/);
  });
});
