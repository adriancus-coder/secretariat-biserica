import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * After the password is re-entered for a person-list export, further exports in the next 10 minutes
 * do not ask again: an httpOnly cookie holding the user id and an expiry, signed with a key derived
 * from AUTH_SECRET. A sign-out does not clear it, but it only works for the same user and expires.
 */
export const EXPORT_GRANT_COOKIE = "export_ok";
export const EXPORT_GRANT_SECONDS = 10 * 60;

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing");
  return Buffer.from(hkdfSync("sha256", secret, "secretariat-biserica", "export-grant", 32));
}

const mac = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

/** The cookie value for this user, valid for 10 minutes from `now` (ms). */
export function grantValue(userId: string, now = Date.now()): string {
  const payload = `${userId}.${Math.floor(now / 1000) + EXPORT_GRANT_SECONDS}`;
  return `${payload}.${mac(payload)}`;
}

/** Is the cookie a valid, unexpired grant for this user? */
export function hasGrant(value: string | undefined, userId: string, now = Date.now()): boolean {
  if (!value) return false;
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  const payload = value.slice(0, i);
  const [uid, exp] = payload.split(".");
  if (uid !== userId || !(Number(exp) * 1000 > now)) return false;
  const a = Buffer.from(value.slice(i + 1));
  const b = Buffer.from(mac(payload));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Set-Cookie header for a grant (Secure when the app runs over HTTPS). */
export function grantCookieHeader(userId: string, secure: boolean): string {
  return `${EXPORT_GRANT_COOKIE}=${grantValue(userId)}; Path=/; Max-Age=${EXPORT_GRANT_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
