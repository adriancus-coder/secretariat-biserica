/**
 * Sliding-window rate limiter kept in process memory.
 * Good enough for a single instance: counters reset on restart and are not shared between
 * instances (see docs/ROADMAP.md before scaling out).
 */
export interface RateLimiter {
  /** Records an attempt for `key`. False (and nothing recorded) once `limit` attempts fall in the window. */
  hit(key: string, now?: number): boolean;
  /** Number of keys currently tracked (for tests). */
  size(): number;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const attempts = new Map<string, number[]>();

  function prune(now: number) {
    for (const [key, times] of attempts) {
      if (times.every((t) => now - t >= windowMs)) attempts.delete(key);
    }
    // Still too many live keys: drop the oldest ones (Map keeps insertion order).
    for (const key of attempts.keys()) {
      if (attempts.size <= maxKeys) break;
      attempts.delete(key);
    }
  }

  return {
    hit(key, now = Date.now()) {
      const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        attempts.set(key, recent);
        return false;
      }
      recent.push(now);
      attempts.delete(key);
      attempts.set(key, recent);
      if (attempts.size > maxKeys) prune(now);
      return true;
    },
    size: () => attempts.size,
  };
}
