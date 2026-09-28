"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const MESSAGES: Record<string, string> = {
  salvat: "Salvat.",
  sters: "Șters.",
  inregistrat: "Înregistrat în registru.",
  importat: "Import finalizat.",
};

/**
 * Mesaj scurt de confirmare (ca „toast”-ul din prototip), declanșat de un parametru din URL
 * după o redirecționare (ex. ?salvat=1). Parametrul e apoi eliminat din adresă.
 */
export function Flash() {
  const params = useSearchParams();
  const pathname = usePathname();
  const key = Object.keys(MESSAGES).find((k) => params.has(k));
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);

  // Preia mesajul din URL și curăță adresa (fără o nouă cerere la server).
  useEffect(() => {
    if (!key) return;
    const text = params.get("mesaj") || MESSAGES[key];
    const sp = new URLSearchParams(params.toString());
    sp.delete(key);
    sp.delete("mesaj");
    window.history.replaceState(window.history.state, "", `${pathname}${sp.size ? `?${sp}` : ""}`);
    // Intenționat fără anulare: curățarea URL-ului re-execută efectul, dar mesajul trebuie afișat.
    setTimeout(() => setToast({ text, at: Date.now() }), 0);
  }, [key, params, pathname]);

  // Ascunde mesajul după 2,5 secunde.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {toast.text}
    </div>
  );
}
