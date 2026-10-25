/**
 * The visitor's IP for rate limits and the last-login network. Only behind a proxy we trust
 * (AUTH_TRUST_HOST=true, e.g. Render) are the headers read, in this order: `cf-connecting-ip`,
 * `true-client-ip`, then the LAST `x-forwarded-for` entry — the one the trusted proxy appended; the
 * entries before it come from the client and can be forged. The value must be an IPv4 or IPv6
 * literal; otherwise (or without a trusted proxy) all visitors share one counter ("necunoscut"). Pure.
 */
export const UNKNOWN_IP = "necunoscut";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** True for an IPv4 or IPv6 address literal (no port, no brackets, no zone). */
export function isIpLiteral(value: string): boolean {
  if (IPV4.test(value)) return true;
  if (!value.includes(":") || !/^[0-9a-fA-F:.]{2,45}$/.test(value)) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

export function ipFromHeaders(get: (name: string) => string | null, trustProxy: boolean): string {
  if (!trustProxy) return UNKNOWN_IP;
  const candidates = [get("cf-connecting-ip"), get("true-client-ip"), get("x-forwarded-for")?.split(",").at(-1)];
  for (const raw of candidates) {
    const v = raw?.trim();
    if (v) return isIpLiteral(v) ? v.toLowerCase() : UNKNOWN_IP;
  }
  return UNKNOWN_IP;
}

/** For display (Setări → Utilizatori): the network part only, "192.168.1.x" / "2001:db8:85a3::x". */
export function truncateIp(ip: string | null | undefined): string {
  if (!ip || ip === UNKNOWN_IP) return "";
  if (ip.includes(".") && !ip.includes(":")) return ip.split(".").slice(0, 3).join(".") + ".x";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::x";
  return "";
}
