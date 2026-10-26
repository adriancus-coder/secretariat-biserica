"use client";

import { useEffect, useState } from "react";
import { captureInstallPrompt, clearPrivateCaches } from "./pwa-store";

const VERSION = process.env.NEXT_PUBLIC_SW_VERSION ?? "0";
/** Set by "Actualizează": only then does the new worker taking control reload the page. */
let updateAccepted = false;

/**
 * Registers the service worker (production builds only) and shows "O versiune nouă este
 * disponibilă — Actualizează" when a new version is waiting; the click activates it and reloads.
 */
export function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    captureInstallPrompt();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // A first install also changes the controller (clients.claim): no reload then.
    const onChange = () => {
      if (!updateAccepted) return;
      updateAccepted = false;
      window.location.reload();
    };
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(VERSION)}`, { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        // A first install takes over silently; only an update (an older worker in control) asks.
        const offer = (sw: ServiceWorker | null) => {
          if (sw && navigator.serviceWorker.controller) setWaiting(sw);
        };
        offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => sw.state === "installed" && offer(sw));
        });
        navigator.serviceWorker.addEventListener("controllerchange", onChange);
      })
      .catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);
  if (!waiting) return null;
  return (
    <div className="toast toast-update" role="status" aria-live="polite">
      <span>O versiune nouă este disponibilă</span>
      <button type="button" className="btn btn-sm" onClick={() => {
          updateAccepted = true;
          waiting.postMessage({ type: "skip-waiting" });
        }}>
        Actualizează
      </button>
    </div>
  );
}

/** On the sign-in pages (after sign-out or an expired session): caches other than the static one go. */
export function ClearPrivateCaches() {
  useEffect(() => {
    void clearPrivateCaches();
  }, []);
  return null;
}
