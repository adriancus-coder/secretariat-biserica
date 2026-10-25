"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/shell/icons";

/**
 * Full-screen signature pad (touch, pen and mouse through pointer events; works in iOS Safari).
 * Calls `onConfirm` with the drawing as a PNG data URL; the server downscales it.
 */
export function SignaturePad({ name, onConfirm, onCancel, busy }: { name: string; onConfirm: (png: string) => void; onCancel: () => void; busy: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const g = c.getContext("2d")!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.6;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#111";
    const lock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lock;
    };
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div className="sign-overlay" role="dialog" aria-modal="true" aria-label={`Semnătura: ${name}`}>
      <div className="sign-head">
        <b>{name}</b>
        <span className="hint !mt-0">Semnați în chenarul de mai jos. Pe telefon, rotiți ecranul pentru mai mult spațiu.</span>
      </div>
      <canvas
        ref={canvas}
        className="sign-canvas"
        onPointerDown={(e) => {
          try {
            // Keeps the stroke when the finger leaves the canvas; best-effort (some pointers cannot be captured).
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          drawing.current = true;
          const g = e.currentTarget.getContext("2d")!;
          const [x, y] = point(e);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 0.1, y + 0.1);
          g.stroke();
          setEmpty(false);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const g = e.currentTarget.getContext("2d")!;
          const [x, y] = point(e);
          g.lineTo(x, y);
          g.stroke();
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <div className="sign-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Renunță
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || empty}
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
          }}
        >
          Șterge
        </button>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" disabled={busy || empty} onClick={() => onConfirm(canvas.current!.toDataURL("image/png"))}>
          <Icon name="bifa" className="size-[18px]" />
          {busy ? "Se salvează…" : "Confirmă"}
        </button>
      </div>
    </div>
  );
}
