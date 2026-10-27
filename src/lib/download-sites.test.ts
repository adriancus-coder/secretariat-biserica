import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PWA-DOWNLOADS: every download goes through downloadFile() (src/lib/download.ts) and its controls
 * (src/components/ui/download.tsx). No `<a download>`, `a.download =`, `window.location =` or
 * `window.open(` elsewhere, and no link or form straight to a file route (/pdf/…, /api/…).
 */
const ALLOWED = [join("src", "lib", "download.ts"), join("src", "components", "ui", "download.tsx")];
const RULES: [RegExp, string][] = [
  [/<a\b[^>]*\sdownload\b/, "<a download>"],
  [/^\s*download(\s|>|=|\{|$)/m, "download attribute"],
  [/\.download\s*=/, "a.download ="],
  [/window\.location(\.href)?\s*=(?!=)|location\.assign\(|location\.replace\(/, "window.location"],
  [/window\.open\(/, "window.open"],
  [/href=\{?["'`]\/(pdf|api)\//, "link to a file route"],
  [/<form\b[^>]*action=\{?["'`]\/(pdf|api)\//, "form posting to a file route"],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return p.includes("generated") ? [] : files(p);
    return /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}

describe("PWA-DOWNLOADS: one way to download", () => {
  it("no download outside downloadFile()", () => {
    const offenders: string[] = [];
    for (const f of files("src")) {
      if (ALLOWED.some((a) => f.endsWith(a))) continue;
      const text = readFileSync(f, "utf8");
      for (const [re, what] of RULES) if (re.test(text)) offenders.push(`${f}: ${what}`);
    }
    expect(offenders).toEqual([]);
  });
});
