import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePrototypeJson } from "@/domain/backup";
import { PRIETENI_LABEL, STATUS_HINT, STATUS_LABEL, STATUS_LABEL_SHORT, statusForLabel } from "./labels";

/** STATUS-LABEL-PRIETEN: one label, written only in labels.ts. */
describe("the PRIETEN label", () => {
  it("long, short, counted and the hint", () => {
    expect(STATUS_LABEL.PRIETEN).toBe("Prieten al casei Domnului (nebotezat)");
    expect(STATUS_LABEL_SHORT.PRIETEN).toBe("Prieten (nebotezat)");
    expect(STATUS_LABEL_SHORT.MEMBRU).toBe(STATUS_LABEL.MEMBRU);
    expect(PRIETENI_LABEL).toBe("prieteni ai casei Domnului (nebotezați)");
    expect(STATUS_HINT.PRIETEN).toContain("devine aparținător (art. 28 lit. b)");
  });

  it("the import accepts the older labels and the new ones, all → PRIETEN", () => {
    for (const l of ["Prieten", "prieten al casei Domnului", "Prieten al casei Domnului (nebotezat)", "Prieten (nebotezat)", "PRIETEN", " Prieten  al casei Domnului "]) expect(statusForLabel(l)).toBe("PRIETEN");
    expect(statusForLabel("Aparținător")).toBe("APARTINATOR");
    expect(statusForLabel("Necunoscut")).toBeUndefined();
    const file = { members: [{ id: "a", nume: "Pop", prenume: "Ion", statut: "Prieten" }], meetings: [], events: [], documents: [], groups: [], notes: [] };
    const r = parsePrototypeJson(file);
    expect(r.errors).toEqual([]);
    expect(r.backup.members[0].statut).toBe("PRIETEN");
  });

  it("no hand-written „Prieten” in src/ outside labels.ts and the tests", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) {
          if (f !== "generated") walk(p);
        } else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && p !== join("src", "lib", "labels.ts") && /Prieten/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk("src");
    expect(hits).toEqual([]);
  });
});
