"use client";

import { useState } from "react";

/** Copies `text` to the clipboard; the label confirms for two seconds. */
export function CopyButton({ text, label = "Copiază", className = "btn btn-sm" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copiat" : label}
    </button>
  );
}
