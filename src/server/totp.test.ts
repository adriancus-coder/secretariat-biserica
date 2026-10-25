import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, newTotpSecret, otpauthUrl, totpStep, verifyTotp } from "./totp";

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890", 8 digits.
const RFC_SECRET = Buffer.from("12345678901234567890");

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC test vectors", () => {
    for (const [t, code] of [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ] as const) {
      expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(code);
    }
  });

  it("round-trips base32", () => {
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").equals(RFC_SECRET)).toBe(true);
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("accepts a code once, with one step of drift", () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(secret, code, { now })).toBe(step);
    expect(verifyTotp(secret, hotp(RFC_SECRET, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, hotp(RFC_SECRET, step - 2), { now })).toBeNull();
    expect(verifyTotp(secret, code, { now, lastStep: step })).toBeNull();
    expect(verifyTotp(secret, "12345", { now })).toBeNull();
  });

  it("builds the otpauth URL", () => {
    expect(otpauthUrl("ABC", "ana@x.ro", "Secretariat Maranata")).toBe(
      "otpauth://totp/Secretariat%20Maranata%3Aana%40x.ro?secret=ABC&issuer=Secretariat+Maranata&algorithm=SHA1&digits=6&period=30",
    );
  });
});
