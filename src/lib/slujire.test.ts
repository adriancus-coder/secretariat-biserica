import { describe, expect, it } from "vitest";
import { noteWithSlujire } from "./slujire";

describe("noteWithSlujire", () => {
  it("prepends the old text once", () => {
    expect(noteWithSlujire("Vine din Oslo.", "cor, tineret")).toBe("Slujire (vechi): cor, tineret\nVine din Oslo.");
    expect(noteWithSlujire("", "cor")).toBe("Slujire (vechi): cor");
    expect(noteWithSlujire("Slujire (vechi): cor\nAltceva", "cor")).toBe("Slujire (vechi): cor\nAltceva");
    expect(noteWithSlujire("Notă", "  ")).toBe("Notă");
  });
});
