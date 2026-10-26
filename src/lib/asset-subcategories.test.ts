import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_ASSET_SUBCATEGORIES, defaultSubcategoriesData, subcategoryError, usedText } from "./asset-subcategories";
import { NOMEN_DEFAULTS } from "./labels";

describe("PATRIMONY-SUBCATEGORIES", () => {
  it("the defaults equal the migration's list, under default category names only („Altele” has none)", () => {
    const sql = readFileSync("prisma/migrations/20261120100000_asset_subcategories/migration.sql", "utf8");
    const fromSql: Record<string, string[]> = {};
    for (const m of sql.matchAll(/\('([^']+)', '([^']+)', (\d+)\)/g)) (fromSql[m[1]] ??= [])[Number(m[3])] = m[2];
    expect(fromSql).toEqual(DEFAULT_ASSET_SUBCATEGORIES);
    for (const c of Object.keys(DEFAULT_ASSET_SUBCATEGORIES)) expect(NOMEN_DEFAULTS.categoriiPatrimoniu).toContain(c);
    expect(defaultSubcategoriesData("c", NOMEN_DEFAULTS.categoriiPatrimoniu)).toHaveLength(26);
    expect(defaultSubcategoriesData("c", ["Mobilă", "Altele"])).toEqual([]);
  });

  it("the server's check and the usage text", () => {
    expect(subcategoryError(null, "Mobilier", false)).toBeNull();
    expect(subcategoryError({ categorie: "Mobilier" }, "Mobilier", true)).toBeNull();
    expect(subcategoryError({ categorie: "Mobilier" }, "Bucătărie", true)).toBe("Subcategoria nu aparține categoriei alese.");
    expect(subcategoryError(null, "Mobilier", true)).toBe("Subcategoria nu mai există.");
    expect([usedText(0), usedText(1), usedText(5)]).toEqual([null, "Folosită la 1 bun", "Folosită la 5 bunuri"]);
  });
});
