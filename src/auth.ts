import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "./server/db";
import { afterFailedLogin, isLocked } from "./server/login-throttle";
import { burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from "./server/password";

/** Cod de eroare generic: nu dezvăluim dacă e-mailul există sau parola e greșită. */
class InvalidCredentials extends CredentialsSignin {
  code = "credentiale";
}
class TooManyAttempts extends CredentialsSignin {
  code = "blocat";
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          await burnPasswordCheck(password);
          throw new InvalidCredentials();
        }
        if (isLocked(user)) throw new TooManyAttempts();

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          await prisma.user.update({ where: { id: user.id }, data: afterFailedLogin(user) });
          throw new InvalidCredentials();
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lastFailedLoginAt: null,
            lastLoginAt: new Date(),
            ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
          },
        });
        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      },
    }),
  ],
});
