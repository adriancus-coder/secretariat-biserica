"use client";

import { useEffect } from "react";

const SELECTOR = 'input[type="date"], input[type="time"]';

function mark(el: Element) {
  if (el instanceof HTMLInputElement && (el.type === "date" || el.type === "time")) el.dataset.empty = el.value ? "false" : "true";
}

/**
 * Marks empty date and time fields (`data-empty="true"`), so iPhone / iPad Safari can show the
 * "zz.ll.aaaa" placeholder it does not draw itself (globals.css). Covers fields added later too.
 */
export function EmptyDateMarker() {
  useEffect(() => {
    document.querySelectorAll(SELECTOR).forEach(mark);
    const onEdit = (e: Event) => e.target instanceof Element && mark(e.target);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("focusout", onEdit, true);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          mark(n);
          n.querySelectorAll(SELECTOR).forEach(mark);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("focusout", onEdit, true);
      observer.disconnect();
    };
  }, []);
  return null;
}
