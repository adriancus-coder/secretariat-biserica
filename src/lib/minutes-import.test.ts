import { describe, expect, it } from "vitest";
import { resolveImport, type ImportDraft } from "./minutes-import";

const draft: ImportDraft = {
  fileName: "pv.docx",
  initial: { invitati: "Lucia Avram" },
  points: [],
  selected: ["p1"],
  approx: [],
  unmatched: [
    { name: "Ion Popscu", candidates: [] },
    { name: "Ana Pop", candidates: ["p2", "p3"] },
  ],
  warnings: [],
};

describe("resolveImport", () => {
  it("adds picked persons and keeps the rest as guests", () => {
    expect(resolveImport(draft, { "Ana Pop": "p3" })).toEqual({ selected: ["p1", "p3"], invitati: "Lucia Avram, Ion Popscu" });
  });
  it("keeps every unmatched name as a guest without choices", () => {
    expect(resolveImport({ ...draft, initial: {} }, {})).toEqual({ selected: ["p1"], invitati: "Ion Popscu, Ana Pop" });
  });
});
