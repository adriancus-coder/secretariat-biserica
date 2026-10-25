import { describe, expect, it } from "vitest";
import { consentState, currentConsents, type ConsentRow } from "./consents";

const row = (kind: ConsentRow["kind"], granted: boolean, day: number, extra: Partial<ConsentRow> = {}): ConsentRow => ({
  kind,
  granted,
  givenAt: new Date(Date.UTC(2026, 0, day)),
  createdAt: new Date(Date.UTC(2026, 0, day)),
  source: "ONLINE",
  withdrawnAt: null,
  ...extra,
});

describe("current consents", () => {
  it("takes the latest answer per kind; a withdrawal counts", () => {
    const cur = currentConsents([row("PHOTOS", true, 1), row("PHOTOS", false, 5), row("BIRTHDAY", true, 3, { withdrawnAt: new Date() })]);
    expect(consentState(cur.PHOTOS)).toBe("NU");
    expect(consentState(cur.BIRTHDAY)).toBe("RETRAS");
    expect(consentState(cur.CONTACT)).toBe("NEEXPRIMAT");
  });
});
