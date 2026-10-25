import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, isPdfPath } from "./csp";

describe("CSP", () => {
  it("allows scripts only with the nonce, never inline", () => {
    const csp = contentSecurityPolicy("abc123", { dev: false, https: true });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy("n", { dev: true, https: false })).toContain("'unsafe-eval'");
  });
  it("leaves PDF responses alone", () => {
    expect(isPdfPath("/pdf/proces-verbal/x")).toBe(true);
    expect(isPdfPath("/cerere/maranata/statut/cult")).toBe(true);
    expect(isPdfPath("/cerere/maranata")).toBe(false);
  });
});
