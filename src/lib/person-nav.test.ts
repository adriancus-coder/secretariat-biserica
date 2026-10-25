import { describe, expect, it } from "vitest";
import { listHref, listQuery, withDin } from "./person-nav";

describe("person navigation links", () => {
  it("keeps the list query", () => {
    const din = listQuery({ filtru: "toate", q: "pop", functie: undefined });
    expect(din).toBe("filtru=toate&q=pop");
    expect(withDin("/persoane/p1", din)).toBe("/persoane/p1?din=filtru%3Dtoate%26q%3Dpop");
    expect(withDin("/persoane/p1", "")).toBe("/persoane/p1?din=");
    expect(withDin("/persoane/p1", undefined)).toBe("/persoane/p1");
    expect(withDin("/persoane/p1/editare", din, { salvat: "1" })).toBe("/persoane/p1/editare?salvat=1&din=filtru%3Dtoate%26q%3Dpop");
    expect(listHref(din)).toBe("/persoane?filtru=toate&q=pop");
    expect(listHref(undefined)).toBe("/persoane");
  });
});
