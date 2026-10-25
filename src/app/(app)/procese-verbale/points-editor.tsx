"use client";

import { useState } from "react";
import { Field } from "@/components/ui/fields";
import { MAX_POINTS, POINT_MAX } from "@/lib/minutes";

interface Point {
  key: number;
  text: string;
}

let nextKey = 0;

/**
 * "Puncte discutate și aprobate": an ordered list of short paragraphs, each with ↑ ↓ and ✕.
 * The list travels as JSON in the hidden field `puncte`.
 */
export function PointsEditor({ initial, error }: { initial: string[]; error?: string }) {
  const [points, setPoints] = useState<Point[]>(() => initial.map((text) => ({ key: nextKey++, text })));
  const update = (key: number, text: string) => setPoints((list) => list.map((p) => (p.key === key ? { ...p, text } : p)));
  const remove = (key: number) => setPoints((list) => list.filter((p) => p.key !== key));
  const move = (i: number, d: -1 | 1) =>
    setPoints((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <Field label="Puncte discutate și aprobate" htmlFor="punct-0" error={error}>
      <input type="hidden" name="puncte" value={JSON.stringify(points.map((p) => p.text))} />
      {points.length ? (
        <ol className="points">
          {points.map((p, i) => (
            <li key={p.key}>
              <span className="points-nr" aria-hidden="true">
                {i + 1}.
              </span>
              <textarea
                id={`punct-${i}`}
                value={p.text}
                onChange={(e) => update(p.key, e.target.value)}
                rows={2}
                maxLength={POINT_MAX}
                aria-label={`Punctul ${i + 1}`}
              />
              <span className="points-tools">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Mută punctul ${i + 1} mai sus`}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => move(i, 1)}
                  disabled={i === points.length - 1}
                  aria-label={`Mută punctul ${i + 1} mai jos`}
                >
                  ↓
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(p.key)} aria-label={`Șterge punctul ${i + 1}`}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint !mt-0 mb-2">Niciun punct încă.</p>
      )}
      <button
        type="button"
        className="btn btn-sm"
        disabled={points.length >= MAX_POINTS}
        onClick={() => setPoints((list) => [...list, { key: nextKey++, text: "" }])}
      >
        + Adaugă punct
      </button>
    </Field>
  );
}
