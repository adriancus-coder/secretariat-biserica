import type { NextAuthConfig } from "next-auth";

/** Rutele accesibile fără autentificare. */
export const PUBLIC_PATHS = ["/autentificare", "/inregistrare", "/invitatie", "/resetare-parola", "/am-uitat-parola"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/api/auth");
}

/**
 * Configurația comună Auth.js, fără dependențe de baza de date — folosită și de proxy.
 * Furnizorul de autentificare (e-mail + parolă) este adăugat în src/auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/autentificare" },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      if (isPublicPath(request.nextUrl.pathname)) return true;
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.sv = user.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      session.sessionVersion = token.sv ?? 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
