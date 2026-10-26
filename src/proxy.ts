import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, isPublicPath } from "./auth.config";
import { contentSecurityPolicy, isPdfPath } from "./lib/csp";

/**
 * Two jobs, before any page renders:
 * - visitors without a session go to the login page (only a navigation filter: the real
 *   authorization — role, church, active account — is checked on the server in every page, action
 *   and route, see src/server/session.ts);
 * - every HTML page gets a Content-Security-Policy with a fresh nonce, which Next.js puts on its
 *   own scripts (this needs dynamic rendering, which the app uses anyway).
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!req.auth?.user && !isPublicPath(pathname)) {
    const login = req.nextUrl.clone();
    login.pathname = "/autentificare";
    login.search = "";
    login.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (isPdfPath(pathname)) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
    https: (process.env.APP_URL ?? "").startsWith("https://"),
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  matcher: [
    // Prefetch requests included: they get the same CSP and the same login redirect.
    // The service worker and the offline page are public static files (no session, no CSP nonce).
    "/((?!api/|_next/static|_next/image|favicon.ico|sw\\.js$|offline\\.html$|.*\\.(?:png|svg|ico|jpg|jpeg|webp|woff2?|ttf|webmanifest)$).*)",
  ],
};
