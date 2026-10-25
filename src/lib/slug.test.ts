import { describe, expect, it } from "vitest";
import { isValidSlug, SLUG_MAX, slugify, slugVariant } from "./slug";

describe("slugify", () => {
  it.each([
    ["Maranata Stavanger", "maranata-stavanger"],
    ["Biserica Creștină după Evanghelie „Betel” Ștei", "biserica-crestina-dupa-evanghelie-betel"],
    ["ÎNVIEREA Țăndărei", "invierea-tandarei"],
    ["Şcoala cu cedilă Ţ", "scoala-cu-cedila-t"],
    ["Kristen Menighet Ålesund Ørsta Æsir", "kristen-menighet-alesund-orsta-aesir"],
    ["Straße & Łódź", "strasse-lodz"],
    ["  --Elim!!  ", "elim"],
    ["Biserica nr. 7", "biserica-nr-7"],
  ])("%s → %s", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("keeps slugs between 3 and 40 characters", () => {
    expect(slugify("")).toBe("biserica");
    expect(slugify("№ ★")).toBe("biserica");
    expect(slugify("Ai")).toBe("biserica-ai");
    const long = slugify("Biserica Penticostală Maranata din Stavanger, Rogaland, Norvegia");
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(long.endsWith("-")).toBe(false);
    for (const name of ["Maranata", "Ai", "", "x".repeat(80), "Biserica - - - nr 1"]) {
      expect(isValidSlug(slugify(name))).toBe(true);
    }
  });
});

describe("slugVariant", () => {
  it("appends -n and stays within the limit", () => {
    expect(slugVariant("maranata-stavanger", 2)).toBe("maranata-stavanger-2");
    const base = "a".repeat(39) + "b";
    expect(slugVariant(base, 12)).toBe(`${"a".repeat(37)}-12`);
    expect(slugVariant("abcdefghij-klmnopqrstuvwxyz-0123456789ab", 3)).toBe("abcdefghij-klmnopqrstuvwxyz-0123456789-3");
    expect(slugVariant("abcdefghij-klmnopqrstuvwxyz-0123456789-x", 2).length).toBeLessThanOrEqual(SLUG_MAX);
  });
});

describe("isValidSlug", () => {
  it.each([
    ["abc", true],
    ["maranata-stavanger", true],
    ["ab", false],
    ["Maranata", false],
    ["-abc", false],
    ["abc-", false],
    ["a--b", false],
    ["ăbc", false],
    ["a".repeat(41), false],
  ])("%s → %s", (slug, ok) => {
    expect(isValidSlug(slug)).toBe(ok);
  });
});
