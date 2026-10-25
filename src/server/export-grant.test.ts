import { beforeAll, describe, expect, it } from "vitest";
import { grantValue, hasGrant } from "./export-grant";

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests-only-0123456789";
});

describe("export password grant", () => {
  it("is valid for the same user for 10 minutes only, and cannot be forged", () => {
    const now = Date.UTC(2026, 9, 25, 12, 0, 0);
    const v = grantValue("u1", now);
    expect(hasGrant(v, "u1", now + 9 * 60_000)).toBe(true);
    expect(hasGrant(v, "u1", now + 11 * 60_000)).toBe(false);
    expect(hasGrant(v, "u2", now)).toBe(false);
    const [uid, exp, sig] = v.split(".");
    expect(hasGrant(`${uid}.${Number(exp) + 3600}.${sig}`, "u1", now)).toBe(false);
    expect(hasGrant(undefined, "u1", now)).toBe(false);
  });
});
