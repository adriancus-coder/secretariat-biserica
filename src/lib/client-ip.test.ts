import { describe, expect, it } from "vitest";
import { ipFromHeaders, isIpLiteral, truncateIp } from "./client-ip";

describe("client IP", () => {
  const h = (v: Record<string, string>) => (k: string) => v[k] ?? null;

  it("ignores a forged first X-Forwarded-For entry: the proxy-added last entry wins", () => {
    expect(ipFromHeaders(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }), true)).toBe("203.0.113.7");
    expect(ipFromHeaders(h({ "x-forwarded-for": "203.0.113.7" }), true)).toBe("203.0.113.7");
  });

  it("prefers cf-connecting-ip, then true-client-ip", () => {
    expect(ipFromHeaders(h({ "cf-connecting-ip": "198.51.100.9", "true-client-ip": "198.51.100.8", "x-forwarded-for": "203.0.113.7" }), true)).toBe("198.51.100.9");
    expect(ipFromHeaders(h({ "true-client-ip": "2001:DB8::1", "x-forwarded-for": "203.0.113.7" }), true)).toBe("2001:db8::1");
  });

  it("invalid values and an untrusted proxy give 'necunoscut'", () => {
    expect(ipFromHeaders(h({ "x-forwarded-for": "203.0.113.7" }), false)).toBe("necunoscut");
    expect(ipFromHeaders(h({ "x-forwarded-for": "203.0.113.7, <script>" }), true)).toBe("necunoscut");
    expect(ipFromHeaders(h({ "x-forwarded-for": "203.0.113.7, 999.1.1.1" }), true)).toBe("necunoscut");
    expect(ipFromHeaders(h({ "cf-connecting-ip": "evil" }), true)).toBe("necunoscut");
    expect(ipFromHeaders(h({}), true)).toBe("necunoscut");
  });

  it("recognises address literals", () => {
    for (const ok of ["10.0.0.1", "255.255.255.255", "::1", "2001:db8:85a3::8a2e:370:7334", "::ffff:192.0.2.1"]) expect(isIpLiteral(ok), ok).toBe(true);
    for (const bad of ["256.1.1.1", "1.2.3", "1.2.3.4:80", "[::1]", "abc", ":::", "1:2:3:4:5:6:7:8:9"]) expect(isIpLiteral(bad), bad).toBe(false);
  });

  it("truncates for display", () => {
    expect(truncateIp("203.0.113.7")).toBe("203.0.113.x");
    expect(truncateIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3::x");
    expect(truncateIp("necunoscut")).toBe("");
    expect(truncateIp(null)).toBe("");
  });
});
