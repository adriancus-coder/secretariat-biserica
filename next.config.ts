import type { NextConfig } from "next";

/**
 * Headers for every response. The pages' Content-Security-Policy (with a per-request nonce) is set
 * in src/proxy.ts; here only what applies everywhere, PDFs and API routes included.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
      // Importul JSON (copie de siguranță) și documentele citite cu Claude (cel mult 20 MB, plus anvelopa formularului).
      bodySizeLimit: "25mb",
    },
    proxyClientMaxBodySize: "25mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
