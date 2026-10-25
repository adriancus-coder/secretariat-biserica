import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { hitIpLimit, IP_LIMIT_MESSAGE } from "@/server/ip-limits";

export const { GET } = handlers;

/** Direct posts to the credentials callback count against the login limit (HTTP 429 when over it). */
export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith("/callback/credentials") && !(await hitIpLimit("login"))) {
    return new Response(IP_LIMIT_MESSAGE, { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "900" } });
  }
  return handlers.POST(req);
}
