import { signOut } from "@/auth";

/**
 * "Ieșire din cont": a plain form POST (a full page load, not a server action, so the response
 * headers reach the browser). Ends the session, tells the browser to drop its HTTP cache
 * (`Clear-Site-Data: "cache"`) and goes to the sign-in page, whose layout also asks the service
 * worker to keep only the static app files. A cross-site post is refused.
 */
export async function POST(req: Request) {
  if (req.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
  await signOut({ redirect: false });
  return new Response(null, {
    status: 303,
    headers: { Location: "/autentificare", "Clear-Site-Data": '"cache"', "Cache-Control": "no-store" },
  });
}
