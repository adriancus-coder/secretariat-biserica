import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Token aleator pentru linkuri de invitație / resetare; în baza de date se păstrează doar hash-ul. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** URL-ul public al aplicației (pentru linkurile trimise utilizatorilor). */
export function appUrl(path: string, requestOrigin?: string | null): string {
  const base = process.env.APP_URL || process.env.AUTH_URL || requestOrigin || "http://localhost:3000";
  return new URL(path, base).toString();
}
