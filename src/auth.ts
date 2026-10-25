import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "./server/db";
import { consumeChallenge } from "./server/two-factor";

/** Cod de eroare generic: nu dezvăluim dacă e-mailul există sau parola e greșită. */
class InvalidCredentials extends CredentialsSignin {
  code = "credentiale";
}

const credentialsSchema = z.object({ challenge: z.string().min(20).max(200) });

/**
 * The credentials provider accepts only a verified login challenge: the password (and, when the
 * user has one, the second factor) were checked by the login actions (src/server/actions/auth.ts,
 * two-factor.ts). A direct e-mail + password post is refused, so the second factor cannot be skipped.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { challenge: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();
        const userId = await consumeChallenge(parsed.data.challenge);
        if (!userId) throw new InvalidCredentials();
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.active) throw new InvalidCredentials();
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      },
    }),
  ],
});
