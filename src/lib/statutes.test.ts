import { describe, expect, it } from "vitest";
import { consentNote, looksLikePdf, statuteKindFromSlug } from "./statutes";

describe("statutes", () => {
  it("maps URL slugs", () => {
    expect(statuteKindFromSlug("cult")).toBe("STATUT_CULT");
    expect(statuteKindFromSlug("intern")).toBe("STATUT_INTERN");
    expect(statuteKindFromSlug("altul")).toBeNull();
  });
  it("writes the consent note only for the statutes accepted", () => {
    expect(consentNote(["STATUT_INTERN", "STATUT_CULT"], "25.10.2026")).toBe("A acceptat statutul cultului și statutul intern la 25.10.2026.");
    expect(consentNote(["STATUT_INTERN"], "25.10.2026")).toBe("A acceptat statutul intern la 25.10.2026.");
    expect(consentNote([], "25.10.2026")).toBe("");
  });
  it("recognises a PDF by its header", () => {
    expect(looksLikePdf(new TextEncoder().encode("%PDF-1.7 ..."))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("<html>"))).toBe(false);
  });
});
