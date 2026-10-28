import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return p.includes("generated") ? [] : files(p);
    return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}

/** TEXT-SIZE-ONE-PLACE: the A⁻ / A⁺ control lives only in Contul meu → Aspect. */
describe("TEXT-SIZE-ONE-PLACE", () => {
  it("only /cont renders TextSizeControl", () => {
    const users = files("src").filter((f) => !f.endsWith("text-size-control.tsx") && readFileSync(f, "utf8").includes("<TextSizeControl"));
    expect(users).toEqual([join("src", "app", "(app)", "cont", "page.tsx")]);
  });
});
