import { describe, expect, it } from "vitest";
import { defaultOrdination, highestOrdination, isOfficiatedEvent, matchOfficiant, officiantWarning } from "./officiants";

const options = [
  { name: "Ioan Pop", ordinat: "DIACON" as const },
  { name: "Daniel Mureșan", ordinat: "PASTOR" as const },
];

describe("officiants (Statut art. 30)", () => {
  it("marks the default ordained roles", () => {
    expect(defaultOrdination("Diacon")).toBe("DIACON");
    expect(defaultOrdination("pastor")).toBe("PASTOR");
    expect(defaultOrdination("Secretar")).toBeNull();
    expect(highestOrdination([null, "DIACON", "PREZBITER"])).toBe("PREZBITER");
  });
  it("matches a typed name in any order, with or without a title", () => {
    expect(matchOfficiant("diacon Pop Ioan", options)?.ordinat).toBe("DIACON");
    expect(matchOfficiant("Pastorul Daniel Muresan", options)?.ordinat).toBe("PASTOR");
    expect(matchOfficiant("pastor Vasile Ionescu (Biserica Elim)", options)).toBeNull();
  });
  it("warns when a diacon officiates a baptism or a wedding, not otherwise", () => {
    expect(officiantWarning("Botez", "Ioan Pop", options)).toMatch(/art\. 30 alin\. 1 lit\. a/);
    expect(officiantWarning("Nuntă", "Ioan Pop", options)).not.toBeNull();
    expect(officiantWarning("Înmormântare", "Ioan Pop", options)).toBeNull();
    expect(officiantWarning("Botez", "Daniel Mureșan", options)).toBeNull();
    expect(officiantWarning("Botez", "pastor din altă biserică", options)).toBeNull();
    expect(isOfficiatedEvent("Cina Domnului")).toBe(true);
    expect(isOfficiatedEvent("Agapă")).toBe(false);
  });
});
