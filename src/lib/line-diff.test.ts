import { describe, expect, it } from "vitest";
import { lineDiff } from "./line-diff";

describe("lineDiff", () => {
  it("keeps common lines and marks removed and added ones", () => {
    expect(lineDiff("a\nb\nc", "a\nx\nc\nd")).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
      { op: "add", text: "x" },
      { op: "same", text: "c" },
      { op: "add", text: "d" },
    ]);
    expect(lineDiff("same", "same")).toEqual([{ op: "same", text: "same" }]);
  });
});
