import { describe, expect, it } from "vitest";
import { daysBetween } from "./dates";

describe("daysBetween", () => {
  it("counts calendar days on the ISO strings, across months and DST", () => {
    expect(daysBetween("2026-09-25", "2026-10-25")).toBe(30);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-25", "2026-10-25")).toBe(0);
    expect(daysBetween("2026-10-26", "2026-10-25")).toBe(-1);
  });
});
