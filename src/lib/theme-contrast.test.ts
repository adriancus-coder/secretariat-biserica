import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The custom properties of the first block that starts with `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Every background secondary text appears on: the page, cards, fields, alerts and tags.
const BACKGROUNDS = ["paper", "panel", "field", "gold-soft", "warn-soft", "ok-soft"];

describe("readable text (WCAG AA, 4.5:1)", () => {
  const themes = {
    light: tokens(":root {"),
    "dark (system)": tokens(':root:not([data-theme="light"]) {'),
    "dark (chosen)": tokens(':root[data-theme="dark"] {'),
  };
  for (const [name, t] of Object.entries(themes)) {
    it(`${name}: hints and secondary text (--ink-3), --ink-2 and --ink on every background`, () => {
      for (const fg of ["ink-3", "ink-2", "ink"]) {
        for (const bg of BACKGROUNDS) {
          expect(t[fg], `${name} --${fg}`).toBeDefined();
          expect(contrast(t[fg], t[bg]), `${name}: --${fg} on --${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
  it("both dark blocks use the same tokens", () => {
    expect(themes["dark (system)"]).toEqual(themes["dark (chosen)"]);
  });
});
