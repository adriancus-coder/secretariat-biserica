/** După atâtea încercări eșuate consecutive, contul e blocat temporar. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

interface LoginCounters {
  failedLoginCount: number;
  lastFailedLoginAt: Date | null;
}

export function isLocked(user: LoginCounters, now = new Date()): boolean {
  return (
    user.failedLoginCount >= MAX_FAILED_LOGINS &&
    user.lastFailedLoginAt !== null &&
    now.getTime() - user.lastFailedLoginAt.getTime() < LOCK_MINUTES * 60_000
  );
}

/** Valorile contoarelor după o încercare eșuată (după expirarea blocării, numărătoarea reîncepe). */
export function afterFailedLogin(user: LoginCounters, now = new Date()): LoginCounters {
  const lockExpired = user.failedLoginCount >= MAX_FAILED_LOGINS && !isLocked(user, now);
  return { failedLoginCount: lockExpired ? 1 : user.failedLoginCount + 1, lastFailedLoginAt: now };
}
