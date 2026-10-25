import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, looksLikeRecoveryCode, newEmailCode, newRecoveryCodes, spendRecoveryCode } from "./two-factor";

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests-only-0123456789";
});

describe("second factor helpers", () => {
  it("encrypts the TOTP secret (random IV, authenticated)", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP");
    const b = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(a)).toBe("JBSWY3DPEHPK3PXP");
    const [v, iv, tag, ct] = a.split(".");
    const tampered = [v, iv, tag, `${ct.slice(0, -2)}AA`].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("gives eight recovery codes, each usable once", () => {
    const { codes, hashes } = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(hashes.join()).not.toContain(codes[0]);
    const left = spendRecoveryCode(hashes, codes[3].toUpperCase().replace("-", " "));
    expect(left).toHaveLength(7);
    expect(spendRecoveryCode(left!, codes[3])).toBeNull();
    expect(looksLikeRecoveryCode(codes[0])).toBe(true);
    expect(looksLikeRecoveryCode("123456")).toBe(false);
  });

  it("makes 6-digit e-mail codes", () => {
    const { code, hash } = newEmailCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
