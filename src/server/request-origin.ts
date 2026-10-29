import "server-only";
import { headers } from "next/headers";

/**
 * The origin the visitor used (scheme + host), for links shown in the UI to a signed-in user.
 * Never use it for links sent by e-mail: those are built from APP_URL only (see email.ts).
 */
export async function requestOrigin(): Promise<string | null> {
  // Outside a request (a background job) there is no visitor: the links then use APP_URL.
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return null;
  }
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : null;
}
