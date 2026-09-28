"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
  const key = Object.keys(MESSAGES).find((k) => params.has(k));
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    const text = params.get("mesaj") || MESSAGES[key];
    const show = setTimeout(() => setMessage(text), 0);
    const sp = new URLSearchParams(params.toString());
    sp.delete(key);
    sp.delete("mesaj");
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
    const hide = setTimeout(() => setMessage(null), 2500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [key, params, pathname, router]);

  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
