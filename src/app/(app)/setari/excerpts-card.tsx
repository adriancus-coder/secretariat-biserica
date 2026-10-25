"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { MAX_EXCERPTS, type StatuteExcerpt } from "@/lib/statute-excerpts";
import { resetStatuteExcerptsAction, saveStatuteExcerptsAction } from "@/server/actions/statutes";

interface Row extends StatuteExcerpt {
  key: number;
}

let nextKey = 0;

/**
 * Setări: "Extrase din statut afișate în cererea de membru" — ordered sections (title, article, page in
 * the Cult's statute, plain text). Administrators edit; "Revino la textul implicit" restores
 * docs/statut-extrase.md.
 */
export function ExcerptsCard({ excerpts, isDefault, readOnly }: { excerpts: StatuteExcerpt[]; isDefault: boolean; readOnly: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => excerpts.map((x) => ({ ...x, key: nextKey++ })));
  const [state, save, saving] = useActionState(saveStatuteExcerptsAction, initialFormState);
  const [resetState, reset, resetting] = useActionState(async () => {
    const r = await resetStatuteExcerptsAction();
    if (r.ok) window.location.reload();
    return r;
  }, initialFormState);
  const update = (key: number, patch: Partial<StatuteExcerpt>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <div className="card mt-7">
      <h3>Extrase din statut afișate în cererea de membru</h3>
      <p className="hint mb-3">
        Apar în formularul public de cerere, în cardul „Ce înseamnă să fiți membru al bisericii”, și pliate în pagina de actualizare a datelor pentru
        membri și aparținători. Pagina deschide statutul Cultului la pagina respectivă. {isDefault ? "Acum: textul implicit." : "Acum: text modificat."}
      </p>
      {readOnly ? (
        <ol className="pl-5 list-decimal">
          {excerpts.map((x) => (
            <li key={x.titlu}>
              {x.titlu} — Statut {x.articol}
              {x.pagina ? ` (pagina ${x.pagina})` : ""}
            </li>
          ))}
        </ol>
      ) : (
        <>
          <form action={save}>
            <input
              type="hidden"
              name="extrase"
              value={JSON.stringify(rows.map((r) => ({ titlu: r.titlu, articol: r.articol, pagina: r.pagina, text: r.text })))}
            />
            {rows.map((r, i) => (
              <fieldset key={r.key} className="subfields">
                <legend>Secțiunea {i + 1}</legend>
                <div className="field">
                  <label htmlFor={`ex-t-${r.key}`}>Titlu</label>
                  <input id={`ex-t-${r.key}`} value={r.titlu} maxLength={120} onChange={(e) => update(r.key, { titlu: e.target.value })} />
                </div>
                <div className="row2">
                  <div className="field">
                    <label htmlFor={`ex-a-${r.key}`}>Articolul</label>
                    <input id={`ex-a-${r.key}`} value={r.articol} maxLength={120} placeholder="art. 25" onChange={(e) => update(r.key, { articol: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`ex-p-${r.key}`}>Pagina în statut</label>
                    <input
                      id={`ex-p-${r.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      value={r.pagina ?? ""}
                      onChange={(e) => update(r.key, { pagina: e.target.value ? Math.min(999, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) : null })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`ex-x-${r.key}`}>Text</label>
                  <textarea id={`ex-x-${r.key}`} rows={8} value={r.text} maxLength={6000} onChange={(e) => update(r.key, { text: e.target.value })} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Mută secțiunea ${i + 1} mai sus`}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Mută secțiunea ${i + 1} mai jos`}>
                    ↓
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} disabled={rows.length === 1}>
                    Șterge secțiunea
                  </button>
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn btn-sm mb-3"
              disabled={rows.length >= MAX_EXCERPTS}
              onClick={() => setRows((list) => [...list, { key: nextKey++, titlu: "", articol: "", pagina: null, text: "" }])}
            >
              + Adaugă secțiune
            </button>
            <FormMessage state={state} />
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Se salvează…" : "Salvează extrasele"}
              </button>
            </div>
          </form>
          <form
            action={reset}
            onSubmit={(e) => {
              if (!window.confirm("Reveniți la textul implicit al extraselor? Modificările se pierd.")) e.preventDefault();
            }}
          >
            <FormMessage state={resetState} />
            <div className="actions">
              <button type="submit" className="btn" disabled={resetting || isDefault}>
                Revino la textul implicit
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
