import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://secretariat.example";
const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

/** public/sw.js in a sandbox: its listeners, and every URL it writes to CacheStorage. */
function loadWorker() {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const puts: string[] = [];
  const cache = { match: async () => undefined, put: async (req: { url: string }) => void puts.push(req.url), addAll: async (urls: string[]) => void puts.push(...urls.map((u) => ORIGIN + u)) };
  const self: Record<string, unknown> = {
    location: { href: `${ORIGIN}/sw.js?v=abc123`, origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] ??= []).push(fn),
    clients: { claim: async () => undefined },
    skipWaiting: () => undefined,
  };
  const sandbox = {
    self,
    URL,
    caches: { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true },
    fetch: async () => ({ ok: true, type: "basic", clone() { return this; } }),
  };
  vm.runInNewContext(source, sandbox);
  const route = self.swRoute as (r: { url: string; method: string; mode?: string; origin: string }) => string;
  async function request(path: string, method = "GET", mode = "cors") {
    const waits: Promise<unknown>[] = [];
    const url = path.startsWith("http") ? path : ORIGIN + path;
    for (const fn of listeners.fetch ?? []) fn({ request: { url, method, mode }, respondWith: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    return waits.length > 0;
  }
  return { route, request, puts, listeners };
}

const NEVER_CACHED = [
  "/",
  "/persoane",
  "/persoane/cm123abc",
  "/persoane?q=pop",
  "/pdf/document/cm123",
  "/pdf/proces-verbal/cm1/word",
  "/api/export",
  "/api/persoane/export",
  "/cerere/maranata",
  "/cerere/maranata/statut/cult",
  "/actualizare/abcDEF123",
  "/actualizare/g/xyz",
  "/autentificare",
  "/manifest.webmanifest",
  "/sw.js",
  "/_next/image?url=%2Ficons%2Ficon-192.png&w=64&q=75",
  "/_next/static/chunks/app.js?_rsc=1",
];

describe("service worker routing table", () => {
  it("caches only static files of this version", () => {
    const { route } = loadWorker();
    const r = (path: string, method = "GET") => route({ url: ORIGIN + path, method, origin: ORIGIN });
    expect(r("/_next/static/chunks/main-abc.js")).toBe("static");
    expect(r("/_next/static/media/source-serif-4.woff2")).toBe("static");
    expect(r("/icons/icon-192.png")).toBe("static");
    expect(r("/offline.html")).toBe("static");
    for (const path of NEVER_CACHED) expect(r(path), path).toBe("network");
    expect(r("/_next/static/chunks/main-abc.js", "POST")).toBe("network");
    expect(route({ url: "https://cdn.example/_next/static/x.js", method: "GET", origin: ORIGIN })).toBe("network");
  });

  it("never writes a page, PDF, API answer, server action or public form to a cache", async () => {
    const w = loadWorker();
    for (const path of NEVER_CACHED) {
      await w.request(path, "GET", "navigate");
      await w.request(path, "GET", "cors");
    }
    // A server action is a POST to the page.
    await w.request("/persoane/cm123/editare", "POST", "cors");
    expect(w.puts).toEqual([]);
    await w.request("/_next/static/chunks/main-abc.js");
    expect(w.puts).toEqual([`${ORIGIN}/_next/static/chunks/main-abc.js`]);
  });

  it("precaches only the offline page and the icons, in a cache named after the version", async () => {
    const w = loadWorker();
    const waits: Promise<unknown>[] = [];
    for (const fn of w.listeners.install ?? []) fn({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(w.puts.map((u) => u.replace(ORIGIN, ""))).toEqual(["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"]);
    expect(source).toContain("static-${VERSION}");
  });

  it("the offline page says that no church data is kept on the device", () => {
    const html = readFileSync(join(process.cwd(), "public/offline.html"), "utf8");
    expect(html).toContain("Nu există conexiune. Datele bisericii nu sunt păstrate pe acest dispozitiv; reîncercați când sunteți online.");
    expect(html).toContain("Reîncearcă");
    expect(html).not.toMatch(/<script/i);
  });
});
