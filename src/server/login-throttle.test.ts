import { describe, expect, it } from "vitest";
import { afterFailedLogin, isLocked, LOCK_MINUTES, MAX_FAILED_LOGINS } from "./login-throttle";

describe("blocarea după încercări eșuate", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it("blochează după numărul maxim de încercări, pentru durata stabilită", () => {
    expect(isLocked({ failedLoginCount: MAX_FAILED_LOGINS - 1, lastFailedLoginAt: minutesAgo(1) }, now)).toBe(false);
    expect(isLocked({ failedLoginCount: MAX_FAILED_LOGINS, lastFailedLoginAt: minutesAgo(1) }, now)).toBe(true);
    expect(isLocked({ failedLoginCount: MAX_FAILED_LOGINS, lastFailedLoginAt: minutesAgo(LOCK_MINUTES + 1) }, now)).toBe(false);
    expect(isLocked({ failedLoginCount: 9, lastFailedLoginAt: null }, now)).toBe(false);
  });

  it("numărătoarea reîncepe după expirarea blocării", () => {
    expect(afterFailedLogin({ failedLoginCount: 2, lastFailedLoginAt: minutesAgo(1) }, now).failedLoginCount).toBe(3);
    expect(
      afterFailedLogin({ failedLoginCount: MAX_FAILED_LOGINS, lastFailedLoginAt: minutesAgo(LOCK_MINUTES + 5) }, now)
        .failedLoginCount,
    ).toBe(1);
  });
});
