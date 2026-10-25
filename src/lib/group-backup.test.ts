import { describe, expect, it } from "vitest";
import { addGroupExtras, parseGroupExtras } from "./group-backup";

describe("group extras in the JSON backup", () => {
  it("writes and reads the linked roles by name; older files have none", () => {
    const groups: Record<string, Record<string, unknown>> = { g1: { id: "g1", nume: "Laudă" }, g2: { id: "g2", nume: "Cor" } };
    addGroupExtras(groups, new Map([["g1", { functie: "Laudă și închinare", functieLider: "Lider laudă și închinare" }]]));
    expect(groups.g1).toMatchObject({ functie: "Laudă și închinare", functieLider: "Lider laudă și închinare" });
    expect(groups.g2.functie).toBeUndefined();
    const parsed = parseGroupExtras({ groups });
    expect(parsed.get("g1")).toEqual({ functie: "Laudă și închinare", functieLider: "Lider laudă și închinare" });
    expect(parsed.has("g2")).toBe(false);
    expect(parseGroupExtras({ groups: { g3: { id: "g3", functie: 7 } } }).size).toBe(0);
  });
});
