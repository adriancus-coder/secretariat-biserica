/**
 * Statute references (Statut = Statutul Cultului Creștin Penticostal, Ordinul SSC nr. 141/15.12.2025):
 * discipline is art. 27 (forms alin. 3, exclusion on written notice alin. 5, no transfer during an
 * investigation alin. 6, the measure in the transfer certificate alin. 9, minutes alin. 10, appeal in
 * 15 days alin. 11, exclusion grounds alin. 13), reinstatement art. 271, the procedure art. 272.
 * Art. 26 is the members' duties: it must never be cited for discipline.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const DIRS = ["src", "docs", "README.md", "CLAUDE.md", "tests"];
const SKIP = /node_modules|src\/generated|statute-refs\.test\.ts$/;

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return [path];
  return readdirSync(full).flatMap((f) => files(join(path, f)));
}

const all = DIRS.flatMap(files).filter((f) => !SKIP.test(f) && /\.(ts|tsx|md|sql)$/.test(f));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("statute references", () => {
  it("never cite art. 26 for discipline", () => {
    const hits = all.flatMap((f) =>
      read(f)
        .split("\n")
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(({ line }) => /art\.\s*26\b/i.test(line) && /disciplin|măsur|masur|excluder|suspend|cercet|sancți|contesta/i.test(line)),
    );
    expect(hits).toEqual([]);
  });

  it("cite the discipline paragraphs where the rules are applied", () => {
    expect(read("src/server/discipline.ts")).toMatch(/art\. 27 alin\. 6/);
    expect(read("src/domain/documents.ts")).toMatch(/art\. 27 alin\. 9/);
    expect(read("src/lib/discipline-print.ts")).toMatch(/art\. 27 alin\. 5/);
    expect(read("src/lib/discipline-print.ts")).toMatch(/art\. 27 alin\. 11/);
    expect(read("src/lib/schemas/discipline.ts")).toMatch(/art\. 27 alin\. 10/);
  });
});
