import { describe, expect, it } from "vitest";
import { aliasesToJson, parseAliasesJson } from "./aliases-backup";

describe("aliases backup", () => {
  it("round-trips and normalizes, dropping invalid and duplicate entries", () => {
    const json = { aliases: aliasesToJson([{ personId: "p1", alias: "adrian cusniriuc" }]) };
    expect(parseAliasesJson(json)).toEqual([{ membru: "p1", alias: "adrian cusniriuc" }]);
    expect(
      parseAliasesJson({ aliases: [{ membru: "p2", alias: "Ion  POP" }, { membru: "p3", alias: "pop ion" }, { alias: "x" }, { membru: "p4", alias: "" }, 5] }),
    ).toEqual([{ membru: "p2", alias: "ion pop" }]);
  });

  it("is null for files without the collection", () => {
    expect(parseAliasesJson({ members: {} })).toBeNull();
    expect(parseAliasesJson(null)).toBeNull();
  });
});
