import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NameRow } from "./name-row";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("names are never cut", () => {
  it("NameRow renders the name and the details as separate wrapping parts", () => {
    const html = renderToStaticMarkup(createElement(NameRow, { lead: "12", name: "Cusniriuc Adrian Emanuel", detail: "Secretar, Cor, Sunet, Transmisie live" }));
    expect(html).toContain('<span class="name-row-name">Cusniriuc Adrian Emanuel</span>');
    expect(html).toContain('<span class="name-row-detail">Secretar, Cor, Sunet, Transmisie live</span>');
    expect(renderToStaticMarkup(createElement(NameRow, { name: "Ion" }))).not.toContain("name-row-detail");
  });

  it("no component truncates text with an ellipsis, a line clamp or nowrap", () => {
    const offenders = files(join(process.cwd(), "src")).filter((f) => /\b(truncate|text-ellipsis|line-clamp-\d|whitespace-nowrap)\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("list rows and name rows have no ellipsis in the stylesheet", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const sel of [".item .t {", ".item .m {", ".name-row-name {", ".name-row-detail {"]) {
      const block = css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
      expect(block, sel).not.toMatch(/ellipsis|nowrap|line-clamp/);
    }
  });
});
