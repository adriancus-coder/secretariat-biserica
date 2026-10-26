/*
 * Service worker of the installed app. Plain JavaScript, no build step.
 *
 * Rule: nothing about the church or its people is ever written to the device. Only static files
 * (the hashed /_next/static bundles and fonts, the icons, the offline page) are cached, cache-first,
 * in one cache per app version. Pages, PDFs, API routes, server actions, the public forms and
 * everything else go to the network only; a failed navigation shows the offline page.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"];

/**
 * The routing table: "static" (cache-first) or "network" (never cached). Exposed for the unit test.
 * @param {{ url: string, method: string, mode?: string, origin: string }} req
 */
function swRoute(req) {
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== req.origin) return "network";
  // Query strings (e.g. ?_rsc=) never reach the cache: only the plain static paths below.
  if (url.search && url.pathname !== OFFLINE_URL) return "network";
  if (url.pathname.startsWith("/_next/static/")) return "static";
  if (url.pathname.startsWith("/icons/")) return "static";
  if (url.pathname === OFFLINE_URL) return "static";
  return "network";
}
self.swRoute = swRoute;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  // Older versions' caches go; only this version's static cache stays.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  // "Actualizează" in the update notice.
  if (type === "skip-waiting") self.skipWaiting();
  // Sign-out or an expired session: every cache except the static one is removed (there should be none).
  if (type === "clear-private") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const route = swRoute({ url: req.url, method: req.method, mode: req.mode, origin: self.location.origin });
  if (route === "static") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  // Network only. A navigation that fails (no connection) shows the offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

/*
 * Push: the payload is { title, url, tag, badge } — a generic title and an address inside the app,
 * never personal data. The badge is the number of waiting items (Badging API where supported).
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title.slice(0, 120) : "Secretariat";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
  const tasks = [self.registration.showNotification(title, { tag: typeof data.tag === "string" ? data.tag : "secretariat", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url } })];
  if (typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
    tasks.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(tasks).catch(() => undefined));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.navigate(target).then((c) => (c || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
