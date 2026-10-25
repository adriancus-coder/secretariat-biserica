"use client";

import { useState } from "react";

/** Web Share API with a ready text (and link); where it is missing, the text is copied instead. */
export function ShareButton({ title, text, label = "Partajează", className = "btn btn-sm" }: { title: string; text: string; label?: string; className?: string }) {
  const [note, setNote] = useState("");
  async function share() {
    setNote("");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err) {
        // Closing the share sheet is not an error.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote("Mesajul a fost copiat.");
    } catch {
      setNote("Mesajul nu a putut fi copiat.");
    }
  }
  return (
    <>
      <button type="button" className={className} onClick={share}>
        {label}
      </button>
      {note ? (
        <span role="status" className="self-center text-xs text-ink-3">
          {note}
        </span>
      ) : null}
    </>
  );
}
