import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILY_FILTER_LABEL, otherFamiliesLine } from "./labels";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return p.includes("generated") ? [] : files(p);
    return /\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("FAMILIES-WORDING", () => {
  it("the wording lives in labels.ts only; „fără membri” only in the row tag", () => {
    const offenders: string[] = [];
    for (const f of files("src")) {
      if (f.endsWith(join("lib", "labels.ts"))) continue;
      const text = readFileSync(f, "utf8");
      for (const phrase of ["fără membri", "familii ale bisericii", "Familii ale bisericii", "alte familii în evidență", "Alte familii în evidență"]) if (text.includes(phrase)) offenders.push(`${f}: ${phrase}`);
    }
    expect(offenders).toEqual([]);
    const labels = readFileSync("src/lib/labels.ts", "utf8");
    expect(labels.match(/fără membri[^"]*/g)).toEqual(["fără membri ai bisericii"]);
  });

  it("„+ N alte familii în evidență”, hidden at 0; the /familii filters", () => {
    expect(otherFamiliesLine(0)).toBeNull();
    expect(otherFamiliesLine(1)).toBe("+ 1 altă familie în evidență");
    expect(otherFamiliesLine(2)).toBe("+ 2 alte familii în evidență");
    expect(Object.values(FAMILY_FILTER_LABEL)).toEqual(["Familiile bisericii", "Alte familii", "Toate"]);
  });
});
