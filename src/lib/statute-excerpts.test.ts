import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_EXCERPTS, excerptsField, excerptsToMarkdown, isDefaultExcerpts, rightsPage, storedExcerpts } from "./statute-excerpts";

describe("statute excerpts", () => {
  it("docs/statut-extrase.md equals the default sections", () => {
    expect(excerptsToMarkdown(DEFAULT_EXCERPTS)).toBe(readFileSync(join(process.cwd(), "docs/statut-extrase.md"), "utf8"));
    expect(DEFAULT_EXCERPTS.map((x) => x.articol)).toEqual(["art. 20 alin. 1 și art. 22 alin. 3", "art. 25", "art. 26", "art. 28"]);
    expect(rightsPage(DEFAULT_EXCERPTS)).toBe(12);
  });
  it("falls back to the defaults and validates edits", () => {
    expect(storedExcerpts([])).toEqual(DEFAULT_EXCERPTS);
    expect(storedExcerpts([{ x: 1 }])).toEqual(DEFAULT_EXCERPTS);
    expect(isDefaultExcerpts(storedExcerpts(null))).toBe(true);
    const own = [{ titlu: "T", articol: "art. 1", pagina: null, text: " a)\r\nb) " }];
    expect(excerptsField.parse(JSON.stringify(own))).toEqual([{ titlu: "T", articol: "art. 1", pagina: null, text: "a)\nb)" }]);
    expect(excerptsField.safeParse("[]").success).toBe(false);
    expect(excerptsField.safeParse(JSON.stringify([{ ...own[0], html: "<b>" }])).success).toBe(false);
    expect(rightsPage(own)).toBe(12);
  });
});
