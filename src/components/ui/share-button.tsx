"use client";

import { useEffect, useState } from "react";

/**
 * Web Share API with a ready text. Shown only where the browser can share: elsewhere "Copiază mesajul"
 * beside it does the same job, so there is no second button with the same effect.
 */
export function ShareButton({ title, text, label = "Partajează", className = "btn btn-sm" }: { title: string; text: string; label?: string; className?: string }) {
  const [canShare, setCanShare] = useState(false);
  const [note, setNote] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator is only readable after mount
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  if (!canShare) return null;
  async function share() {
    setNote("");
    try {
      await navigator.share({ title, text });
    } catch (err) {
      // Closing the share sheet is not an error.
      if (!(err instanceof DOMException && err.name === "AbortError")) setNote("Mesajul nu a putut fi partajat. Folosiți „Copiază mesajul”.");
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
