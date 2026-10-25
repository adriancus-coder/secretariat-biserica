import { describe, expect, it } from "vitest";
import { minutesNumber, pointsText, splitDecisions } from "./minutes";

describe("splitDecisions", () => {
  it("numbered lines become points; continuation lines stay with their point; text before goes to observations", () => {
    expect(splitDecisions("S-a hotărât:\n1. Ziua Recoltei\ncu agapă comună\n2) Evanghelizare\n\n3.", "")).toEqual({
      puncte: ["Ziua Recoltei\ncu agapă comună", "Evanghelizare"],
      observatii: "S-a hotărât:",
    });
  });

  it("without numbers, every non-empty line is a point", () => {
    expect(splitDecisions("Se aprobă darea de seamă.\n\nComitetul este reales.", "")).toEqual({
      puncte: ["Se aprobă darea de seamă.", "Comitetul este reales."],
      observatii: "",
    });
  });

  it("keeps the discussions in the observations", () => {
    expect(splitDecisions("", "  Au fost ascultate mărturiile.\nApoi s-a votat.  ")).toEqual({
      puncte: [],
      observatii: "Discuții:\nAu fost ascultate mărturiile.\nApoi s-a votat.",
    });
    expect(splitDecisions("Intro\n1. A", "D").observatii).toBe("Intro\n\nDiscuții:\nD");
  });

  it("does not split on numbers that are not list markers", () => {
    expect(splitDecisions("1.5 milioane pentru renovare\n2026 este anul jubiliar", "").puncte).toEqual([
      "1.5 milioane pentru renovare",
      "2026 este anul jubiliar",
    ]);
  });
});

describe("minutes helpers", () => {
  it("pointsText and minutesNumber", () => {
    expect(pointsText(["A", "B"])).toBe("1. A\n2. B");
    expect(minutesNumber({ nr: 16, anRegistru: 2026 })).toBe("PV nr. 16/2026");
    expect(minutesNumber({ nr: null, anRegistru: null })).toBeNull();
  });
});
