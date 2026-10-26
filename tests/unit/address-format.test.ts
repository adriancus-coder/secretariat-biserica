import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every place that shows an address goes through formatAddress(); nothing joins the parts by hand. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "generated" || name === "node_modules") return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const HAND_MADE = [
  /\$\{[^}]*\.(codPostal|localitate)\b/, // "${x.codPostal} ${x.localitate}"
  /\.(adresa|codPostal|localitate)\b[^\n]*\bjoin\(/, // [a.adresa, a.codPostal].join(", ")
  /\b(adresa|codPostal|localitate)\b[^\n]*\+\s*["'`]/, // adresa + ", "
];

describe("address formatting", () => {
  it("no source file concatenates address parts by hand", () => {
    const offenders: string[] = [];
    for (const file of sources("src")) {
      if (file.endsWith("src/lib/address.ts")) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (HAND_MADE.some((re) => re.test(line))) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
