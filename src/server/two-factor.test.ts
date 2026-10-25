import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret, hasLegacyRecoveryCodes, looksLikeRecoveryCode, newEmailCode, newRecoveryCodes, spendRecoveryCode } from "./two-factor";

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

  it("gives eight 12-character recovery codes, scrypt-hashed, each usable once", async () => {
    const { codes, hashes } = await newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(hashes.every((h) => h.startsWith("scrypt$16384$8$1$"))).toBe(true);
    expect(hashes.join()).not.toContain(codes[0]);
    expect(hasLegacyRecoveryCodes(hashes)).toBe(false);
    const left = await spendRecoveryCode(hashes, codes[3].toUpperCase().replace(/-/g, " "));
    expect(left).toHaveLength(7);
    expect(await spendRecoveryCode(left!, codes[3])).toBeNull();
    expect(looksLikeRecoveryCode(codes[0])).toBe(true);
    expect(looksLikeRecoveryCode("123456")).toBe(false);
  });

  it("still accepts the older 8-character sha256 codes until they are regenerated", async () => {
    const old = createHash("sha256").update("abcdefgh").digest("hex");
    const fresh = await newRecoveryCodes();
    const stored = [old, ...fresh.hashes];
    expect(hasLegacyRecoveryCodes(stored)).toBe(true);
    expect(looksLikeRecoveryCode("abcd-efgh")).toBe(true);
    expect(await spendRecoveryCode(stored, "ABCD-EFGH")).toEqual(fresh.hashes);
    // Regenerated codes replace the old list: the old code is rejected.
    expect(await spendRecoveryCode(fresh.hashes, "abcd-efgh")).toBeNull();
  });

  it("makes 6-digit e-mail codes", () => {
    const { code, hash } = newEmailCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
