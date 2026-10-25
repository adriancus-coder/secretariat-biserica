import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { hashSecret, verifyPassword } from "./password";
import { hashToken, newToken } from "./tokens";

/**
 * Second factor at login: a TOTP code (authenticator app), a 6-digit code by e-mail, or a single-use
 * recovery code. What is stored: the TOTP secret encrypted (AES-256-GCM, key derived from
 * AUTH_SECRET; a new one waits in pendingTotpSecretEnc until confirmed), recovery codes as scrypt
 * hashes (older ones as sha256, still accepted until regenerated), e-mail codes as sha256 hashes, the
 * login challenge as the hash of a random token kept in an httpOnly cookie. Codes are never logged.
 */

export const CHALLENGE_COOKIE = "secretariat_2fa";
export const CHALLENGE_MINUTES = 10;
export const EMAIL_CODE_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const RECOVERY_CODE_COUNT = 8;

// ---------- TOTP secret at rest ----------

function secretKey(): Buffer {
  const base = process.env.AUTH_SECRET;
  if (!base) throw new Error("AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", base, "secretariat-biserica", "totp-secret-v1", 32));
}

/** "v1.<iv>.<tag>.<ciphertext>" (base64url). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(enc: string): string {
  const [v, iv, tag, ct] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

// ---------- Recovery and e-mail codes ----------

const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

export const RECOVERY_CODE_LENGTH = 12;

/** Eight codes "abcd-efgh-jkmn" (12 characters, ~59 bits each) to show once, and their scrypt hashes. */
export async function newRecoveryCodes(): Promise<{ codes: string[]; hashes: string[] }> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const s = Array.from({ length: RECOVERY_CODE_LENGTH }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  });
  return { codes, hashes: await Promise.all(codes.map((c) => hashSecret(normalizeRecovery(c)))) };
}

/** Hashes in the older format (sha256 of an 8-character code): accepted until the codes are regenerated. */
export function hasLegacyRecoveryCodes(hashes: readonly string[]): boolean {
  return hashes.some((h) => !h.startsWith("scrypt$"));
}

/** The stored hashes without the one matching `code`, or null when it matches none (both formats). */
export async function spendRecoveryCode(hashes: readonly string[], code: string): Promise<string[] | null> {
  const n = normalizeRecovery(code);
  for (let i = 0; i < hashes.length; i++) {
    const h = hashes[i];
    const match = h.startsWith("scrypt$") ? await verifyPassword(n, h) : safeEqual(h, hashToken(n));
    if (match) return hashes.filter((_, j) => j !== i);
  }
  return null;
}

export function looksLikeRecoveryCode(code: string): boolean {
  const n = normalizeRecovery(code);
  return (n.length === 8 || n.length === RECOVERY_CODE_LENGTH) && !/^\d+$/.test(code.trim());
}

export function newEmailCode(): { code: string; hash: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { code, hash: hashToken(code) };
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- Login challenge ----------

export function hasSecondFactor(u: { totpEnabled: boolean; emailOtpEnabled: boolean }): boolean {
  return u.totpEnabled || u.emailOtpEnabled;
}

/**
 * Starts the second step of a login. `verified`: the user needs no second factor, so the challenge
 * only carries the verified password to the sign-in (the credentials provider accepts nothing else).
 */
export async function startChallenge(
  userId: string,
  opts: { verified: boolean; setupRequired: boolean; callbackUrl: string },
): Promise<string> {
  const { token, hash } = newToken();
  // Older unfinished challenges of the user are dropped.
  await prisma.loginChallenge.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  await prisma.loginChallenge.create({
    data: {
      tokenHash: hash,
      userId,
      expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000),
      setupRequired: opts.setupRequired,
      verifiedAt: opts.verified ? new Date() : null,
      callbackUrl: opts.callbackUrl,
    },
  });
  return token;
}

export async function setChallengeCookie(token: string) {
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/autentificare",
    maxAge: CHALLENGE_MINUTES * 60,
  });
}

export async function clearChallengeCookie() {
  (await cookies()).delete({ name: CHALLENGE_COOKIE, path: "/autentificare" });
}

/** The pending challenge of this browser (unexpired), with its user, or null. */
export async function currentChallenge() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const c = await prisma.loginChallenge.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { church: { select: { nume: true, require2fa: true, passkeyPolicy: true } } } } },
  });
  if (!c || c.expiresAt < new Date() || !c.user.active) return null;
  return { ...c, token };
}

/** Used by the credentials provider: a verified, unexpired challenge, consumed once. */
export async function consumeChallenge(token: string) {
  const c = await prisma.loginChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!c || !c.verifiedAt || c.expiresAt < new Date()) return null;
  const { count } = await prisma.loginChallenge.deleteMany({ where: { id: c.id } });
  return count === 1 ? c.userId : null;
}
