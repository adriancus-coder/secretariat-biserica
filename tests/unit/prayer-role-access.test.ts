import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { permissions, type Permission } from "@/lib/permissions";

/**
 * The "Rugăciune" role sees only /rugaciune and its own account (Cont). Every page, route handler and
 * server action is checked here: it must ask for a permission that role lacks, unless it is listed
 * below as public, as the account, or as the prayer page. A new route or action fails this test until
 * it is guarded (requireCtx / actionCtx default to "read", which the role lacks).
 */

const ROOT = join(__dirname, "../..");
const PRAYER = { role: "RUGACIUNE" as const, isPastor: true };

function files(dir: string, test: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, test) : test(p) ? [p] : [];
  });
}
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");

const PERMISSION_NAMES = Object.keys(permissions) as Permission[];

/**
 * The permissions a piece of code asks for. `actionCtx(x ? "admin" : "write")` counts both; a guard
 * whose argument is a variable takes the permission names the code passes around (a helper such as
 * `updateCampaign(id, "admin", …)`).
 */
function guards(code: string): { perms: Permission[]; anyUser: boolean } {
  const perms: Permission[] = [];
  const named = (text: string) => [...text.matchAll(/"(\w+)"/g)].map((m) => m[1]).filter((n): n is Permission => (PERMISSION_NAMES as string[]).includes(n));
  for (const m of code.matchAll(/\b(?:requireCtx|actionCtx|requirePermission)\(([^)]*)\)/g)) {
    const args = m[1].trim();
    if (!args) perms.push("read");
    else perms.push(...(named(args).length ? named(args) : named(code)));
  }
  // Code that loads the user itself must test a permission on it.
  const anyUser = /\b(getCurrentUser|requireUser)\(/.test(code);
  if (anyUser) for (const m of code.matchAll(/permissions\.(\w+)\(/g)) perms.push(m[1] as Permission);
  return { perms, anyUser };
}

/** A file's own guard helpers (`async function pastorCtx() { … actionCtx("pastor") … }`), by name. */
function helperGuards(code: string): Map<string, Permission[]> {
  const out = new Map<string, Permission[]>();
  for (const part of code.split(/(?=^(?:async )?function )/m)) {
    const name = /^(?:async )?function (\w+)/.exec(part)?.[1];
    if (name) out.set(name, guards(part.split(/^export /m)[0]).perms);
  }
  return out;
}

/** Reachable without a session (public forms, auth, health) or by design for every signed-in user. */
const PUBLIC_ROUTES = new Set([
  "src/app/api/health/route.ts",
  "src/app/api/auth/[...nextauth]/route.ts",
  "src/app/deconectat/route.ts",
  "src/app/manifest.ts",
]);
// /cautare: every signed-in user; the church's data only with `read` (GLOBAL-SEARCH).
const ACCOUNT_PAGES = new Set(["src/app/(app)/cont/page.tsx", "src/app/(app)/layout.tsx", "src/app/(app)/cautare/page.tsx"]);
const PRAYER_PAGES = new Set(["src/app/(app)/rugaciune/page.tsx"]);

describe("the Rugăciune role reaches no register data", () => {
  it("has only the prayer and account permissions", () => {
    const allowed = (Object.keys(permissions) as Permission[]).filter((p) => permissions[p](PRAYER));
    expect(allowed.sort()).toEqual(["account", "rugaciune"]);
    expect(permissions.rugaciune("VIZUALIZARE")).toBe(false);
    expect(permissions.rugaciune("SECRETAR") && permissions.rugaciune("ADMIN")).toBe(true);
  });

  const appFiles = files(join(ROOT, "src/app"), (f) => /(page|route|layout)\.tsx?$/.test(f)).map(rel);

  it.each(appFiles.filter((f) => f.startsWith("src/app/(app)/") || f.startsWith("src/app/pdf/") || f.startsWith("src/app/api/")))(
    "%s",
    (file) => {
      if (PUBLIC_ROUTES.has(file)) return;
      const code = readFileSync(join(ROOT, file), "utf8");
      const { perms, anyUser } = guards(code);
      if (file.endsWith("layout.tsx") && !perms.length && !anyUser) return; // layouts without data
      if (ACCOUNT_PAGES.has(file)) return expect(anyUser || perms.includes("account")).toBe(true);
      if (PRAYER_PAGES.has(file)) return expect(perms).toContain("rugaciune");
      expect(perms.length, `${file} has no permission check`).toBeGreaterThan(0);
      // Each check the code makes must refuse the role ("Acasă" redirects it to /rugaciune first).
      for (const p of perms) if (p !== "read" || !code.includes('redirect("/rugaciune")')) expect(permissions[p](PRAYER), `${file}: ${p}`).toBe(false);
    },
  );

  /** Server actions open to the role: its own account, and the public forms (no session at all). */
  const OPEN_ACTIONS: Record<string, string[]> = {
    "src/server/actions/auth.ts": ["*"],
    "src/server/actions/two-factor.ts": ["*"],
    "src/server/actions/passkeys.ts": ["*"],
    "src/server/actions/push.ts": ["*"],
    "src/server/actions/data-update.ts": ["*"],
    "src/server/actions/applications.ts": ["submitApplicationAction"],
    // GLOBAL-SEARCH: the pages the user may open; the data groups need `read` (checked in searchData).
    "src/server/actions/search.ts": ["globalSearchAction"],
    "src/server/actions/prayer.ts": ["markPrayerWeekAction", "cancelPrayerWeekAction", "prayerSharedAction", "choosePrayerFamilyAction"],
  };

  const actionFiles = files(join(ROOT, "src/server/actions"), (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith("run.ts")).map(rel);
  const actions = actionFiles.flatMap((file) => {
    const code = readFileSync(join(ROOT, file), "utf8");
    const parts = code.split(/(?=^export async function )/m).filter((p) => p.startsWith("export async function "));
    const helpers = helperGuards(code);
    return parts.map((body) => {
      const viaHelpers = [...helpers].filter(([name]) => body.includes(`${name}(`)).flatMap(([, perms]) => perms);
      return { file, name: /^export async function (\w+)/.exec(body)![1], body, viaHelpers };
    });
  });

  it.each(actions.map((a) => [`${a.file} → ${a.name}`, a] as const))("%s", (_label, a) => {
    const open = OPEN_ACTIONS[a.file];
    if (open && (open.includes("*") || open.includes(a.name))) return;
    // A helper defined earlier in the file may hold the check: then the action calls it.
    const perms = [...guards(a.body).perms, ...a.viaHelpers];
    expect(perms.length, `${a.file} → ${a.name} has no permission check`).toBeGreaterThan(0);
    for (const p of perms) expect(permissions[p](PRAYER), `${a.file} → ${a.name}: ${p}`).toBe(false);
  });
});
