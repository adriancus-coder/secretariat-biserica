import { describe, expect, it } from "vitest";
import { generatedKey, keyParams } from "./generated-kinds";
import { asOfDay, stableJson } from "./source-data";

describe("GENERATED-HASH-STABLE", () => {
  it("equal data give equal text, whatever the order of keys, map entries or set items", () => {
    const a = { b: 1, a: [new Date("2026-01-01T00:00:00Z"), new Map([["y", 2], ["x", 1]])], s: new Set(["b", "a"]), u: undefined };
    const b = { s: new Set(["a", "b"]), a: [new Date("2026-01-01T00:00:00Z"), new Map([["x", 1], ["y", 2]])], b: 1 };
    expect(stableJson(a)).toBe(stableJson(b));
    expect(stableJson({ x: 1 })).not.toBe(stableJson({ x: 2 }));
    expect(stableJson(new Uint8Array([1, 255]))).toBe('"hex:01ff"');
  });

  it("today's date written back as the day a version was saved, in every printed form", () => {
    const text = "Inventarul bunurilor la 30 octombrie 2026 · 30 oct 2026 · 30.10.2026 · 2026-10-30";
    expect(asOfDay(text, "2026-10-30", "2026-10-27")).toBe("Inventarul bunurilor la 27 octombrie 2026 · 27 oct 2026 · 27.10.2026 · 2026-10-27");
    expect(asOfDay(text, "2026-10-30", "2026-10-30")).toBe(text);
  });

  it("a key gives back its source's parameters", () => {
    expect(keyParams("statistici", generatedKey("statistici", { an: 2026 })).toString()).toBe("an=2026");
    expect(keyParams("patrimoniu", generatedKey("patrimoniu", { filtru: "toate", q: "pian:mare" })).toString()).toBe("filtru=toate&q=pian%3Amare");
    expect(keyParams("eveniment", "eveniment:abc").get("id")).toBe("abc");
    expect(keyParams("neamuri", "neamuri").toString()).toBe("");
  });
});
