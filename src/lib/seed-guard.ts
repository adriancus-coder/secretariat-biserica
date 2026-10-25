/**
 * The demo seed rewrites the church with id "demo": it must never reach a real database. Refused in
 * production or for any host other than localhost / 127.0.0.1 / ::1, unless SEED_ALLOW=true. Pure.
 */
export function seedRefusal(env: { NODE_ENV?: string; DATABASE_URL?: string; SEED_ALLOW?: string }): string | null {
  if (env.SEED_ALLOW === "true") return null;
  if (env.NODE_ENV === "production") return "NODE_ENV=production";
  let host = "";
  try {
    host = new URL(env.DATABASE_URL ?? "").hostname;
  } catch {
    return "DATABASE_URL is missing or invalid";
  }
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host) ? null : `database host "${host}" is not local`;
}
