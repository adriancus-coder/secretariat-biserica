import "server-only";
import { headers } from "next/headers";
import { ipFromHeaders } from "@/lib/client-ip";
import { sharedRateLimiter } from "./rate-limit";

/**
 * Per-IP limits of the public authentication steps, kept in memory (one instance; counters reset on
 * restart, see docs/ROADMAP.md and docs/SECURITY.md).
 */
const LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  forgot: { limit: 5, windowMs: 60 * 60_000 },
  code: { limit: 10, windowMs: 15 * 60_000 },
} as const;
export type IpLimit = keyof typeof LIMITS;

export const IP_LIMIT_MESSAGE = "Prea multe încercări de la această adresă. Încercați din nou peste câteva minute.";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return ipFromHeaders((n) => h.get(n), process.env.AUTH_TRUST_HOST === "true");
}

/** Counts one attempt; false when the IP is over the limit for this step. */
export async function hitIpLimit(kind: IpLimit, ip?: string): Promise<boolean> {
  return sharedRateLimiter(`ip-${kind}`, LIMITS[kind]).hit(ip ?? (await clientIp()));
}
