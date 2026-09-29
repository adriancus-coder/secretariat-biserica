import "server-only";
import { prisma } from "./db";
import { isEmailConfigured, sendPasswordResetEmail, type EmailResult } from "./email";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { newToken } from "./tokens";

/** Links requested from "Am uitat parola" are valid for one hour (admin-issued links: 48 hours). */
export const SELF_SERVICE_RESET_HOURS = 1;

export const RESET_REQUESTS_PER_WINDOW = 3;
export const RESET_REQUEST_WINDOW_MINUTES = 15;

// On globalThis so every route bundle (and dev hot reloads) share one counter.
const globalForLimiter = globalThis as unknown as { passwordResetRequests?: RateLimiter };

/** At most 3 requests per e-mail address per 15 minutes (in memory, see docs/ROADMAP.md). */
export const passwordResetRequests = (globalForLimiter.passwordResetRequests ??= createRateLimiter({
  limit: RESET_REQUESTS_PER_WINDOW,
  windowMs: RESET_REQUEST_WINDOW_MINUTES * 60_000,
}));

export type PasswordResetOutcome = EmailResult | "no-account";

/**
 * Handles a "forgot password" request for an already validated, lower-cased e-mail.
 * Runs after the response is sent, so the visitor never learns whether the account exists.
 * Only the SHA-256 of the token is stored; older unused links of the account stop working.
 */
export async function requestPasswordReset(email: string, db: typeof prisma = prisma): Promise<PasswordResetOutcome> {
  const user = await db.user.findUnique({ where: { email }, include: { church: { select: { nume: true } } } });
  if (!user || !user.active) return "no-account";
  if (!isEmailConfigured()) {
    console.warn("[password-reset] request ignored: e-mail sending is not configured");
    return "disabled";
  }
  const { token, hash } = newToken();
  await db.$transaction(async (tx) => {
    await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await tx.passwordReset.create({
      data: {
        churchId: user.churchId,
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + SELF_SERVICE_RESET_HOURS * 3_600_000),
      },
    });
    await tx.auditLog.create({
      data: {
        churchId: user.churchId,
        userId: user.id,
        userName: user.name,
        entity: "USER",
        entityId: user.id,
        entityLabel: `${user.name} <${user.email}>`,
        action: "UPDATE",
        changes: { sursa: "cerere „Am uitat parola”" },
      },
    });
  });
  return sendPasswordResetEmail({
    to: user.email,
    token,
    name: user.name,
    churchName: user.church.nume,
    validHours: SELF_SERVICE_RESET_HOURS,
  });
}
