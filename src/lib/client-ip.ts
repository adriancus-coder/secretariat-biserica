/**
 * The visitor's IP for rate limits. Only behind a proxy we trust (AUTH_TRUST_HOST=true, e.g. Render)
 * is the first X-Forwarded-For entry used; otherwise the header could be forged, and all visitors
 * share one counter ("necunoscut"). Pure.
 */
export function ipFromHeaders(get: (name: string) => string | null, trustProxy: boolean): string {
  if (!trustProxy) return "necunoscut";
  const first = get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(first) ? first : "necunoscut";
}

/** For display (Setări → Utilizatori): the network part only, "192.168.1.x" / "2001:db8:85a3::x". */
export function truncateIp(ip: string | null | undefined): string {
  if (!ip) return "";
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".") + ".x";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::x";
  return "";
}
