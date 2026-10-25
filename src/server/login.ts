import "server-only";
import { prisma } from "./db";
import { afterFailedLogin, isLocked } from "./login-throttle";
import { burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from "./password";

/**
 * The first step of a login: e-mail and password, with the per-account lock after repeated failures.
 * The answer never says whether the e-mail exists (the same work is done either way).
 */
export async function checkPassword(rawEmail: string, password: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !password || password.length > 200 || email.length > 200) return { ok: false as const, reason: "invalid" as const };
  const user = await prisma.user.findUnique({ where: { email }, include: { church: { select: { nume: true, require2fa: true } } } });
  if (!user || !user.active) {
    await burnPasswordCheck(password);
    return { ok: false as const, reason: "invalid" as const };
  }
  if (isLocked(user)) return { ok: false as const, reason: "locked" as const };
  if (!(await verifyPassword(password, user.passwordHash))) {
    await prisma.user.update({ where: { id: user.id }, data: afterFailedLogin(user) });
    return { ok: false as const, reason: "invalid" as const };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lastFailedLoginAt: null,
      ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  return { ok: true as const, user };
}
