import { describe, expect, it } from "vitest";
import { canBeHead, defaultFamilyName, pickHead, type HeadCandidate } from "./families";

const today = "2026-10-25";
const p = (id: string, x: Partial<HeadCandidate> = {}): HeadCandidate => ({
  id,
  statut: "MEMBRU",
  rudenie: "",
  gen: null,
  dataNasterii: null,
  createdAt: "2020-01-01",
  ...x,
});

describe("pickHead", () => {
  it("never picks a child or a minor; only children → no head", () => {
    expect(pickHead([p("k", { statut: "APARTINATOR", rudenie: "Cap de familie", dataNasterii: "2014-01-01" }), p("w", { gen: "F", statut: "PRIETEN" })], today)?.id).toBe("w");
    expect(pickHead([p("y", { gen: "M", dataNasterii: "2012-01-01" }), p("w", { gen: "F" })], today)?.id).toBe("w");
    expect(pickHead([p("k1", { statut: "APARTINATOR", dataNasterii: "2016-01-01" }), p("k2", { dataNasterii: "2015-01-01" })], today)).toBeNull();
    expect(pickHead([], today)).toBeNull();
  });

  it("ranks Membru before Aparținător before Prieten", () => {
    const list = [
      p("f", { statut: "PRIETEN", gen: "M", rudenie: "Cap de familie", dataNasterii: "1940-01-01" }),
      p("a", { statut: "APARTINATOR", gen: "M", dataNasterii: "1950-01-01" }),
      p("m", { statut: "MEMBRU", gen: "F", dataNasterii: "1990-01-01" }),
    ];
    expect(pickHead(list, today)?.id).toBe("m");
    expect(pickHead(list.slice(0, 2), today)?.id).toBe("a");
  });

  it("then Cap de familie, then men, then the oldest known birth date", () => {
    expect(pickHead([p("a", { gen: "M", dataNasterii: "1950-01-01" }), p("b", { rudenie: "Cap de familie", gen: "F" })], today)?.id).toBe("b");
    expect(pickHead([p("w", { gen: "F", dataNasterii: "1940-01-01" }), p("m", { gen: "M", dataNasterii: "1970-01-01" })], today)?.id).toBe("m");
    expect(pickHead([p("x", { dataNasterii: null }), p("y", { dataNasterii: "1980-01-01" })], today)?.id).toBe("y");
    expect(pickHead([p("x", { createdAt: "2021-01-01" }), p("y", { createdAt: "2019-01-01" })], today)?.id).toBe("y");
  });

  it("an adult is 18 on the given day; a missing birth date counts as adult", () => {
    expect(canBeHead({ statut: "MEMBRU", dataNasterii: "2008-10-25" }, today)).toBe(true);
    expect(canBeHead({ statut: "MEMBRU", dataNasterii: "2008-10-26" }, today)).toBe(false);
    expect(canBeHead({ statut: "PRIETEN", dataNasterii: null }, today)).toBe(true);
  });
});

describe("defaultFamilyName", () => {
  it("uses the head's first name and surname", () => {
    expect(defaultFamilyName({ nume: "Mureșan", prenume: "Daniel" })).toBe("Fam. Daniel Mureșan");
    expect(defaultFamilyName({ nume: "Pop", prenume: "" })).toBe("Fam. Pop");
  });
});
