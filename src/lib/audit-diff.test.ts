import { describe, expect, it } from "vitest";
import { displayAuditValue } from "./audit-labels";
import { diff, snapshot } from "./audit-diff";

describe("jurnalul de modificări", () => {
  const fields = ["nume", "statut", "dataIesire", "note"] as const;

  it("diff raportează doar câmpurile schimbate; gol și null sunt echivalente", () => {
    const before = { nume: "Pop", statut: "MEMBRU", dataIesire: null, note: "" };
    const after = { nume: "Pop", statut: "FOST_MEMBRU", dataIesire: new Date("2026-01-05T00:00:00Z"), note: null };
    expect(diff(before, after, fields)).toEqual({
      statut: ["MEMBRU", "FOST_MEMBRU"],
      dataIesire: [null, "2026-01-05"],
    });
  });

  it("snapshot păstrează doar câmpurile completate", () => {
    expect(snapshot({ nume: "Pop", statut: "MEMBRU", note: "", dataIesire: null }, fields)).toEqual({
      nume: "Pop",
      statut: "MEMBRU",
    });
  });

  it("valorile se afișează cu etichete românești", () => {
    expect(displayAuditValue("statut", "FOST_MEMBRU")).toBe("Fost membru");
    expect(displayAuditValue("modIntrare", "NASCUT_IN_BISERICA")).toBe("Născut în biserică");
    expect(displayAuditValue("dataIesire", "2026-01-05")).toBe("5 ian 2026");
    expect(displayAuditValue("tip", "adeverinta")).toBe("Adeverință de membru");
    expect(displayAuditValue("note", null)).toBe("—");
  });
});
