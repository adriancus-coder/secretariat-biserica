import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { stepUpValue, validStepUp } from "./step-up";
import { passkeyPolicyApplies, relyingParty } from "./passkeys";

describe("step-up grant", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET ??= "test-secret-for-unit-tests-only-0123456789";
  });
  const user = { id: "u1", sessionVersion: 3 };
  it("is valid 15 minutes, for the same user and session only", () => {
    const now = Date.parse("2026-10-25T12:00:00Z");
    const v = stepUpValue(user, now);
    expect(validStepUp(v, user, now + 14 * 60_000)).toBe(true);
    expect(validStepUp(v, user, now + 16 * 60_000)).toBe(false);
    expect(validStepUp(v, { ...user, id: "u2" }, now)).toBe(false);
    expect(validStepUp(v, { ...user, sessionVersion: 4 }, now)).toBe(false);
    expect(validStepUp(v.replace(/.$/, (c) => (c === "A" ? "B" : "A")), user, now)).toBe(false);
    expect(validStepUp(undefined, user, now)).toBe(false);
  });
});

describe("passkeys configuration", () => {
  const saved = process.env.APP_URL;
  afterEach(() => {
    process.env.APP_URL = saved;
  });
  it("takes the RP ID and origin from APP_URL and refuses without it", () => {
    process.env.APP_URL = "https://secretariat-biserica.onrender.com";
    expect(relyingParty()).toMatchObject({ rpID: "secretariat-biserica.onrender.com", origin: "https://secretariat-biserica.onrender.com" });
    process.env.APP_URL = "";
    expect(relyingParty()).toBeNull();
    process.env.APP_URL = "http://example.org";
    expect(relyingParty()).toBeNull();
    process.env.APP_URL = "http://localhost:3000";
    expect(relyingParty()?.origin).toBe("http://localhost:3000");
  });
  it("the policy covers pastors and administrators only", () => {
    expect(passkeyPolicyApplies({ role: "ADMIN", isPastor: false }, { passkeyPolicy: true })).toBe(true);
    expect(passkeyPolicyApplies({ role: "SECRETAR", isPastor: true }, { passkeyPolicy: true })).toBe(true);
    expect(passkeyPolicyApplies({ role: "SECRETAR", isPastor: false }, { passkeyPolicy: true })).toBe(false);
    expect(passkeyPolicyApplies({ role: "ADMIN", isPastor: true }, { passkeyPolicy: false })).toBe(false);
  });
});
