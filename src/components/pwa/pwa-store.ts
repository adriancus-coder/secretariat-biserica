"use client";

/**
 * Browser-side state of the installed app: the deferred install prompt (Chrome, Edge, Android) and
 * the service worker registration. The `beforeinstallprompt` event can fire before any install
 * button is on screen, so it is captured here once and handed to whoever asks.
 */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function captureInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const hasInstallPrompt = () => deferred !== null;

export function subscribeInstall(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Shows the browser's install dialog; true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  notify();
  await e.prompt();
  return (await e.userChoice).outcome === "accepted";
}

/** Running from the home screen / as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** Asks the active service worker to drop every cache except the static one. */
export async function clearPrivateCaches() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  (navigator.serviceWorker.controller ?? reg?.active)?.postMessage({ type: "clear-private" });
}
