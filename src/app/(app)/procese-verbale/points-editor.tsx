"use client";

import { useState } from "react";
import { RichEditor } from "@/components/rich-editor/rich-editor";
import { Field } from "@/components/ui/fields";
import { MAX_POINTS } from "@/lib/minutes";
import { emptyRich, plainToRich, richToPlain, type RichDoc } from "@/lib/rich-text";

interface Point {
  key: number;
  doc: RichDoc;
}

let nextKey = 0;

/**
 * "Puncte discutate și aprobate": an ordered list of points, each in the rich-text editor, with ↑ ↓
 * and ✕. The documents travel as JSON in the hidden field `puncteRich` (the server derives the plain
 * `puncte` from them); `puncte` carries the plain text too, for the PDF preview of unsaved changes.
 */
export function PointsEditor({ initial, initialRich, error }: { initial: string[]; initialRich?: (RichDoc | null)[] | null; error?: string }) {
  const [points, setPoints] = useState<Point[]>(() => initial.map((text, i) => ({ key: nextKey++, doc: initialRich?.[i] ?? plainToRich(text) })));
  const update = (key: number, doc: RichDoc) => setPoints((list) => list.map((p) => (p.key === key ? { ...p, doc } : p)));
  const remove = (key: number) => setPoints((list) => list.filter((p) => p.key !== key));
  const move = (i: number, d: -1 | 1) =>
    setPoints((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <Field label="Puncte discutate și aprobate" htmlFor="punct-0" error={error}>
      <input type="hidden" name="puncteRich" value={JSON.stringify(points.map((p) => p.doc))} />
      <input type="hidden" name="puncte" value={JSON.stringify(points.map((p) => richToPlain(p.doc)))} />
      {points.length ? (
        <ol className="points">
          {points.map((p, i) => (
            <li key={p.key}>
              <span className="points-nr" aria-hidden="true">
                {i + 1}.
              </span>
              <RichEditor id={`punct-${i}`} initial={p.doc} label={`Punctul ${i + 1}`} minRows={2} onChange={(doc) => update(p.key, doc)} />
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
        onClick={() => setPoints((list) => [...list, { key: nextKey++, doc: emptyRich() }])}
      >
        + Adaugă punct
      </button>
    </Field>
  );
}
