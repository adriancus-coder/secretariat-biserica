import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
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
      // Importul JSON (copie de siguranță) poate depăși limita implicită de 1 MB.
      bodySizeLimit: "20mb",
    },
    proxyClientMaxBodySize: "20mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
