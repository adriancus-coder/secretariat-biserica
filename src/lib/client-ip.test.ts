import { describe, expect, it } from "vitest";
import { ipFromHeaders, truncateIp } from "./client-ip";

describe("client IP", () => {
  const h = (v: Record<string, string>) => (k: string) => v[k] ?? null;
  it("uses the first X-Forwarded-For entry only behind a trusted proxy", () => {
    expect(ipFromHeaders(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), true)).toBe("203.0.113.7");
    expect(ipFromHeaders(h({ "x-forwarded-for": "203.0.113.7" }), false)).toBe("necunoscut");
    expect(ipFromHeaders(h({ "x-forwarded-for": "<script>" }), true)).toBe("necunoscut");
    expect(ipFromHeaders(h({}), true)).toBe("necunoscut");
  });
  it("truncates for display", () => {
    expect(truncateIp("203.0.113.7")).toBe("203.0.113.x");
    expect(truncateIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3::x");
    expect(truncateIp(null)).toBe("");
  });
});
