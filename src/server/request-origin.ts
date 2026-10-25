import "server-only";
import { headers } from "next/headers";

/**
 * The origin the visitor used (scheme + host), for links shown in the UI to a signed-in user.
 * Never use it for links sent by e-mail: those are built from APP_URL only (see email.ts).
 */
export async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : null;
}
