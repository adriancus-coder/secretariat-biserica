"use client";

import { useEffect } from "react";

export const UNSAVED_MESSAGE = "Aveți modificări nesalvate. Plecați de pe pagină fără să le salvați?";

/**
 * While `dirty`, a click on a link that would leave the page asks for confirmation first. It works
 * in-app (iPhone included) by catching link clicks before React and Next.js see them; it does not
 * use `beforeunload`.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.dataset.skipUnsaved !== undefined) return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);
}
