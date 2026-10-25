import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("campaign tokens", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-for-campaign-tokens-0123456789";
  });

  it("derives the same link token from the id and nonce, a different one after a new nonce", async () => {
    const { linkToken, generalToken, newNonce, isTokenShape } = await import("./campaign-tokens");
    const n = newNonce();
    expect(linkToken("l1", n)).toBe(linkToken("l1", n));
    expect(isTokenShape(linkToken("l1", n))).toBe(true);
    expect(linkToken("l1", newNonce())).not.toBe(linkToken("l1", n));
    expect(generalToken("l1", n)).not.toBe(linkToken("l1", n));
    expect(isTokenShape("abc")).toBe(false);
  });

  it("signs the personal identity cookie for one link and 30 minutes", async () => {
    const { personalIdentityValue, hasPersonalIdentity } = await import("./campaign-tokens");
    const now = Date.UTC(2026, 10, 1, 10);
    const v = personalIdentityValue("l1", "n1", now);
    expect(hasPersonalIdentity(v, "l1", "n1", now + 60_000)).toBe(true);
    expect(hasPersonalIdentity(v, "l1", "n1", now + 31 * 60_000)).toBe(false);
    expect(hasPersonalIdentity(v, "l2", "n1", now)).toBe(false);
    expect(hasPersonalIdentity(v, "l1", "n2", now)).toBe(false);
    expect(hasPersonalIdentity(`${v}x`, "l1", "n1", now)).toBe(false);
  });

  it("encrypts the general identity: unreadable in the browser, bound to the campaign", async () => {
    const { sealGeneralIdentity, openGeneralIdentity } = await import("./campaign-tokens");
    const now = Date.UTC(2026, 10, 1, 10);
    const v = sealGeneralIdentity("c1", "Ana Pop", "92100001", now);
    expect(v).not.toContain("Ana");
    expect(Buffer.from(v.split(".")[2], "base64url").toString("utf8")).not.toContain("Ana");
    expect(openGeneralIdentity(v, "c1", now)).toMatchObject({ nume: "Ana Pop", telefon: "92100001" });
    expect(openGeneralIdentity(v, "c2", now)).toBeNull();
    expect(openGeneralIdentity(v, "c1", now + 31 * 60_000)).toBeNull();
    expect(openGeneralIdentity("garbage", "c1", now)).toBeNull();
  });
});
