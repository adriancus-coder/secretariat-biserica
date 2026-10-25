import { describe, expect, it } from "vitest";
import { parseCampaignsJson, parseConsentsJson } from "./consents-backup";

describe("campaigns and consents in the backup", () => {
  it("reads valid entries and skips the rest; files without them give null", () => {
    expect(parseCampaignsJson({})).toBeNull();
    expect(parseConsentsJson({ consents: "x" })).toBeNull();
    expect(parseCampaignsJson({ campaigns: [{ id: "c1", nume: "Toamnă", deadline: "2026-12-01", stare: "ACTIVE", versiuneNota: "abc" }, { id: "../x", nume: "Rău", deadline: "2026-12-01" }] })).toEqual([
      { id: "c1", nume: "Toamnă", deadline: "2026-12-01", stare: "ACTIVE", versiuneNota: "abc" },
    ]);
    const k = parseConsentsJson({
      consents: [
        { membru: "p1", tip: "PHOTOS", acord: true, versiune: "v", data: "2026-11-01T10:00:00.000Z", sursa: "PAPER", datDe: "p2", retrasLa: null },
        { membru: "p1", tip: "UNKNOWN", acord: true, data: "2026-11-01T10:00:00.000Z" },
        { membru: "p1", tip: "BIRTHDAY", acord: "da", data: "2026-11-01T10:00:00.000Z" },
      ],
    });
    expect(k).toEqual([{ membru: "p1", tip: "PHOTOS", acord: true, versiune: "v", data: "2026-11-01T10:00:00.000Z", sursa: "PAPER", datDe: "p2", retrasLa: null }]);
  });
});
