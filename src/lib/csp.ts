/**
 * The Content-Security-Policy of the HTML pages: scripts only from this origin or with the
 * per-request nonce (no 'unsafe-inline' for scripts), nothing framed, forms posted only here.
 * Inline style attributes are still allowed (React `style` props). Pure.
 */
export function contentSecurityPolicy(nonce: string, opts: { dev: boolean; https: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** PDF responses keep the browser's PDF viewer working: no page CSP on them. */
export function isPdfPath(pathname: string): boolean {
  return pathname.startsWith("/pdf/") || /^\/cerere\/[^/]+\/statut\//.test(pathname);
}
