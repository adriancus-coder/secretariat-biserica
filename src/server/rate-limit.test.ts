import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

const MIN = 60_000;

describe("createRateLimiter", () => {
  it("allows 3 attempts in 15 minutes and rejects the 4th", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 15 * MIN });
    const t0 = 1_000_000;
    expect(limiter.hit("a@x.ro", t0)).toBe(true);
    expect(limiter.hit("a@x.ro", t0 + 1 * MIN)).toBe(true);
    expect(limiter.hit("a@x.ro", t0 + 2 * MIN)).toBe(true);
    expect(limiter.hit("a@x.ro", t0 + 3 * MIN)).toBe(false);
    expect(limiter.hit("a@x.ro", t0 + 14 * MIN)).toBe(false);
  });

  it("frees a slot when the oldest attempt leaves the window (rejected attempts are not counted)", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 15 * MIN });
    const t0 = 1_000_000;
    for (const m of [0, 1, 2]) limiter.hit("a@x.ro", t0 + m * MIN);
    expect(limiter.hit("a@x.ro", t0 + 10 * MIN)).toBe(false);
    expect(limiter.hit("a@x.ro", t0 + 15 * MIN)).toBe(true);
    expect(limiter.hit("a@x.ro", t0 + 15 * MIN + 1)).toBe(false);
  });

  it("counts every key separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 15 * MIN });
    expect(limiter.hit("a@x.ro", 0)).toBe(true);
    expect(limiter.hit("b@x.ro", 0)).toBe(true);
    expect(limiter.hit("a@x.ro", 1)).toBe(false);
  });

  it("keeps memory bounded", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 15 * MIN, maxKeys: 100 });
    for (let i = 0; i < 1_000; i++) limiter.hit(`user${i}@x.ro`, i);
    expect(limiter.size()).toBeLessThanOrEqual(100);
    // The newest keys are kept and still limited.
    for (let i = 0; i < 2; i++) limiter.hit("user999@x.ro", 1_000 + i);
    expect(limiter.hit("user999@x.ro", 2_000)).toBe(false);
  });
});
