import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/** The service worker's cache version: the deployed commit (Render), else the local one. */
function swVersion(): string {
  if (process.env.SW_VERSION) return process.env.SW_VERSION;
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "0";
  }
}

/**
 * Headers for every response. The pages' Content-Security-Policy (with a per-request nonce) is set
 * in src/proxy.ts; here only what applies everywhere, PDFs and API routes included.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_SW_VERSION: swVersion() },
  // pdfkit citește fișierele AFM/ICC din propriul director la runtime; rămâne nebundle-uit.
  serverExternalPackages: ["pdfkit"],
  // Fonturile TTF folosite la generarea PDF-urilor trebuie incluse în build-ul de producție.
  outputFileTracingIncludes: {
    "/pdf/**": ["./assets/fonts/**"],
  },
  experimental: {
    // forbidden() pentru paginile interzise rolului curent.
    authInterrupts: true,
    serverActions: {
      // Importul JSON (copie de siguranță, cel mult 20 MB) și lotul de procese-verbale .docx (cel mult 25 MB).
      bodySizeLimit: "25mb",
    },
    proxyClientMaxBodySize: "25mb",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages are never framed; PDFs only by the app itself (the "Așezare în pagină" preview).
      { source: "/((?!pdf/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/pdf/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      // The service worker: always revalidated (updates are picked up), and only same-origin code.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      { source: "/offline.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
