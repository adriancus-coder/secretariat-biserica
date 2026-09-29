import { connection } from "next/server";
import { databaseReachable } from "@/server/health";

/**
 * Health check for Render (and for humans), public on purpose; `/api/*` is outside the auth proxy.
 * 200 `{ ok: true, db: true }` when the database answers, otherwise 503 `{ ok: true, db: false }`.
 * The body never includes versions or error details.
 */
export async function GET() {
  await connection(); // never prerendered: every call probes the database
  const db = await databaseReachable();
  return Response.json({ ok: true, db }, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
