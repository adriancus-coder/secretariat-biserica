"use client";

import { useState } from "react";
import { TEXT_SIZE_COOKIE, TEXT_SIZES_UI, type UiTextSize } from "@/lib/text-size";

/** Applies the size at once (root font size) and remembers it for a year on this device. */
function applySize(s: UiTextSize) {
  const root = document.documentElement;
  if (s === "100") {
    delete root.dataset.textSize;
    document.cookie = `${TEXT_SIZE_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.dataset.textSize = s;
    document.cookie = `${TEXT_SIZE_COOKIE}=${s}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }
}

/**
 * A⁻ / A⁺: the size of the app's text on this device (100 %, 115 %, 130 %). Shown only in Contul meu →
 * Aspect (TEXT-SIZE-ONE-PLACE); the root layout applies the saved size on every page.
 */
export function TextSizeControl({ current }: { current: UiTextSize }) {
  const [size, setSize] = useState<UiTextSize>(current);
  const i = TEXT_SIZES_UI.indexOf(size);
  const go = (d: -1 | 1) => {
    const next = TEXT_SIZES_UI[i + d];
    if (!next) return;
    setSize(next);
    applySize(next);
  };
  return (
    <div className="text-size" role="group" aria-label="Mărimea textului">
      <button type="button" onClick={() => go(-1)} disabled={i === 0} aria-label="Micșorează textul" title="Micșorează textul">
        A<sup>−</sup>
      </button>
      <span className="text-size-value" aria-live="polite">
        {size} %
      </span>
      <button type="button" onClick={() => go(1)} disabled={i === TEXT_SIZES_UI.length - 1} aria-label="Mărește textul" title="Mărește textul">
        A<sup>+</sup>
      </button>
    </div>
  );
}
