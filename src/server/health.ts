import "server-only";
import { prisma } from "./db";

/** Upper bound for the database probe, so the health check answers before the platform gives up. */
export const DB_TIMEOUT_MS = 3_000;

/**
 * True when the database answers `SELECT 1` within `timeoutMs`; never throws.
 * Uses the global client on purpose: the probe touches no church data.
 */
export async function databaseReachable(timeoutMs = DB_TIMEOUT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch (error) {
    // One line per failure: Prisma messages span several lines, platform logs are line-based.
    const reason = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
    console.error("[health] database check failed:", reason);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
