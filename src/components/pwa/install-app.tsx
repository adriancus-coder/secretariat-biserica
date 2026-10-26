"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { hasInstallPrompt, isIos, isStandalone, promptInstall, subscribeInstall } from "./pwa-store";

/** Safari's share icon (a box with an arrow), as on the iPhone toolbar. */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/**
 * "Instalează aplicația": the browser's own dialog where it offers one (Android, Chrome, Edge), a
 * short instruction on iPhone / iPad (Partajează → Adaugă pe ecranul principal). Hidden when the app
 * already runs installed, and where the browser offers neither.
 */
export function InstallApp({ className = "card" }: { className?: string }) {
  const canPrompt = useSyncExternalStore(subscribeInstall, hasInstallPrompt, () => false);
  const [env, setEnv] = useState<{ standalone: boolean; ios: boolean } | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    // Read after hydration: the server cannot know the device.
    const t = setTimeout(() => setEnv({ standalone: isStandalone(), ios: isIos() }), 0);
    return () => clearTimeout(t);
  }, []);
  if (!env || env.standalone || done || (!canPrompt && !env.ios)) return null;
  return (
    <div className={className} id="instaleaza">
      <h3>Instalează aplicația</h3>
      {canPrompt ? (
        <>
          <p className="hint">Aplicația apare pe ecranul principal și se deschide pe tot ecranul. Datele bisericii nu sunt păstrate pe dispozitiv.</p>
          <button type="button" className="btn btn-primary" onClick={() => void promptInstall().then((ok) => ok && setDone(true))}>
            Instalează aplicația
          </button>
        </>
      ) : (
        <ol className="install-steps">
          <li>
            <span className="install-icon">
              <ShareIcon />
            </span>
            Atingeți <b>Partajează</b> în bara Safari.
          </li>
          <li>
            <span className="install-icon">
              <AddIcon />
            </span>
            Alegeți <b>Adaugă pe ecranul principal</b>, apoi <b>Adaugă</b>.
          </li>
          <li>Deschideți aplicația de pe ecranul principal și autentificați-vă. Datele bisericii nu sunt păstrate pe dispozitiv.</li>
        </ol>
      )}
    </div>
  );
}
