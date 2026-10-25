import { describe, expect, it } from "vitest";
import { defaultFamilyName, pickHead, type HeadCandidate } from "./families";

const today = "2026-10-25";
const p = (id: string, x: Partial<HeadCandidate> = {}): HeadCandidate => ({ id, rudenie: "", gen: null, dataNasterii: null, createdAt: "2020-01-01", ...x });

describe("pickHead", () => {
  it("prefers the person marked Cap de familie, the oldest if several", () => {
    const list = [
      p("a", { gen: "M", dataNasterii: "1950-01-01" }),
      p("b", { rudenie: "Cap de familie", dataNasterii: "1990-01-01" }),
      p("c", { rudenie: "Cap de familie", dataNasterii: "1980-01-01" }),
    ];
    expect(pickHead(list, today)?.id).toBe("c");
  });

  it("then the oldest adult man, then the oldest adult", () => {
    expect(
      pickHead([p("w", { gen: "F", dataNasterii: "1940-01-01" }), p("m", { gen: "M", dataNasterii: "1970-01-01" }), p("y", { gen: "M", dataNasterii: "2015-01-01" })], today)
        ?.id,
    ).toBe("m");
    expect(pickHead([p("w", { gen: "F", dataNasterii: "1975-01-01" }), p("y", { gen: "M", dataNasterii: "2015-01-01" })], today)?.id).toBe("w");
  });

  it("falls back to the oldest person, then the first registered", () => {
    expect(pickHead([p("k1", { dataNasterii: "2015-01-01" }), p("k2", { dataNasterii: "2012-01-01" })], today)?.id).toBe("k2");
    expect(pickHead([p("x", { createdAt: "2021-01-01" }), p("y", { createdAt: "2019-01-01" })], today)?.id).toBe("y");
    expect(pickHead([], today)).toBeNull();
  });

  it("an adult is 18 on the given day", () => {
    expect(pickHead([p("w", { gen: "F", dataNasterii: "1990-01-01" }), p("m", { gen: "M", dataNasterii: "2008-10-25" })], today)?.id).toBe("m");
    expect(pickHead([p("w", { gen: "F", dataNasterii: "1990-01-01" }), p("m", { gen: "M", dataNasterii: "2008-10-26" })], today)?.id).toBe("w");
  });
});

describe("defaultFamilyName", () => {
  it("uses the head's first name and surname", () => {
    expect(defaultFamilyName({ nume: "Mureșan", prenume: "Daniel" })).toBe("Fam. Daniel Mureșan");
    expect(defaultFamilyName({ nume: "Pop", prenume: "" })).toBe("Fam. Pop");
  });
});
