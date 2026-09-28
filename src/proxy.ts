import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Redirecționează vizitatorii neautentificați către pagina de autentificare.
 * Este doar un filtru de navigare: autorizarea reală (rol, biserică, cont activ) se verifică
 * pe server în fiecare pagină, acțiune și rută (vezi src/server/session.ts).
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|jpeg|webp|woff2?|ttf)$).*)"],
};
