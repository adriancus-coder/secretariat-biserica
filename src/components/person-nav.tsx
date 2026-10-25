"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * "‹ Anterior" / "12 din 76" / "Următorul ›" between persons of the list the user came from;
 * Alt+← / Alt+→ on desktop. The keys click the links, so an unsaved-changes guard still applies.
 */
export function PersonNav({
  prevHref,
  nextHref,
  position,
  total,
}: {
  prevHref: string | null;
  nextHref: string | null;
  position: number;
  total: number;
}) {
  const prev = useRef<HTMLAnchorElement>(null);
  const next = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.key === "ArrowLeft" ? prev.current : e.key === "ArrowRight" ? next.current : null;
      if (!target) return;
      e.preventDefault();
      target.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!position) return null;
  return (
    <nav className="person-nav" aria-label="Navigare între persoane">
      {prevHref ? (
        <Link ref={prev} href={prevHref} className="btn" aria-keyshortcuts="Alt+ArrowLeft">
          ‹ Anterior
        </Link>
      ) : (
        <span className="btn" aria-disabled="true">
          ‹ Anterior
        </span>
      )}
      <span className="person-nav-pos" aria-live="polite">
        {position} din {total}
      </span>
      {nextHref ? (
        <Link ref={next} href={nextHref} className="btn" aria-keyshortcuts="Alt+ArrowRight">
          Următorul ›
        </Link>
      ) : (
        <span className="btn" aria-disabled="true">
          Următorul ›
        </span>
      )}
    </nav>
  );
}
