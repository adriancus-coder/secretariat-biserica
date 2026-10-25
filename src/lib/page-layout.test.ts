import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, layoutQuery, layoutSummary, pageLayoutInput, pageLayoutSchema, resolveLayout, storedLayout } from "./page-layout";

describe("page layout of the minutes", () => {
  it("the meeting's own layout wins, then the church's, then the built-in one", () => {
    expect(resolveLayout({}, null)).toEqual(DEFAULT_LAYOUT);
    expect(resolveLayout({ fontSize: 12 }, null)).toEqual({ ...DEFAULT_LAYOUT, fontSize: 12 });
    expect(resolveLayout({ fontSize: 12 }, { marginTop: 35, letterhead: false })).toEqual({ ...DEFAULT_LAYOUT, fontSize: 12, marginTop: 35, letterhead: false });
  });

  it("stored values out of range are ignored, field by field", () => {
    expect(storedLayout({ marginLeft: 99, fontSize: "x", format: "A3", lineHeight: 1.3 })).toEqual({ ...DEFAULT_LAYOUT, lineHeight: 1.3 });
    expect(storedLayout("garbage")).toEqual(DEFAULT_LAYOUT);
  });

  it("the form and the preview query round-trip through the schema", () => {
    const l = { ...DEFAULT_LAYOUT, format: "A5" as const, marginTop: 30, fontSize: 11.5, lineHeight: 1.15, align: "left" as const, letterhead: false };
    expect(pageLayoutSchema.parse(pageLayoutInput(new URLSearchParams(layoutQuery(l))))).toEqual(l);
  });

  it("reports values out of range on their field, in Romanian", () => {
    const r = pageLayoutSchema.safeParse(pageLayoutInput(new URLSearchParams(layoutQuery({ ...DEFAULT_LAYOUT, marginTop: 2, fontSize: 30 }))));
    expect(r.success).toBe(false);
    const issues = Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]));
    expect(issues).toEqual({ marginTop: "Marginea de sus: cel puțin 8 mm.", fontSize: "Mărimea textului: cel mult 16 pt." });
  });

  it("summary", () => {
    expect(layoutSummary(DEFAULT_LAYOUT)).toBe("A4 · margini 22/22/20/20 mm · 13 pt · rânduri 1,55 · aliniat stânga-dreapta · cu antet");
  });
});
