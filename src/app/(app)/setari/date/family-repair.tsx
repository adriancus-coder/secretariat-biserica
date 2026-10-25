"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/shell/icons";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { dissolveAutoFamiliesAction, recalcHeadsAction, type RecalcHeadsState } from "@/server/actions/families";

export interface AutoFamily {
  id: string;
  nume: string;
  head: string;
  members: number;
}

/** One-time repairs of the families created automatically (from the old family text). Admin only. */
export function FamilyRepair({ families }: { families: AutoFamily[] }) {
  const autoCount = families.length;
  const [dissolveState, dissolve, dissolving] = useActionState(dissolveAutoFamiliesAction, initialFormState);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const allChecked = autoCount > 0 && checked.size === autoCount;
  const toggle = (id: string, on: boolean) =>
    setChecked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const [recalcState, recalc, recalculating] = useActionState(async () => recalcHeadsAction(), initialFormState as RecalcHeadsState);
  return (
    <div className="grid gap-4">
      <p className="hint">
        {autoCount === 0
          ? "Nu există familii create automat."
          : autoCount === 1
            ? "O familie a fost creată automat (din textul vechi) și nu a fost modificată de atunci."
            : `${autoCount} familii au fost create automat (din textul vechi) și nu au fost modificate de atunci.`}
      </p>
      <form action={recalc}>
        <button type="submit" className="btn" disabled={recalculating || autoCount === 0}>
          {recalculating ? "Se recalculează…" : "Recalculează capii de familie"}
        </button>
        <p className="hint mt-1">Capul familiei: niciodată un copil sau cineva sub 18 ani; întâi membrii, apoi aparținătorii, apoi prietenii.</p>
        <FormMessage state={recalcState} />
        {recalcState.changes?.length ? (
          <ul className="list-disc pl-5 text-sm mt-2">
            {recalcState.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
      </form>
      <form
        action={dissolve}
        onSubmit={(e) => {
          const n = checked.size;
          if (!window.confirm(`Dizolvați ${n === 1 ? "familia selectată" : `cele ${n} familii selectate`}? Membrii rămân în registru, fără familie.`)) {
            e.preventDefault();
          }
        }}
      >
        <h4 className="font-medium mb-1">Dizolvă familii</h4>
        {autoCount ? (
          <>
            <label className="check mb-1">
              <input type="checkbox" checked={allChecked} onChange={(e) => setChecked(e.target.checked ? new Set(families.map((f) => f.id)) : new Set())} />
              <span className="font-medium">Selectează tot ({autoCount})</span>
            </label>
            <div className="family-pick">
              {families.map((f) => (
                <label key={f.id} className="check">
                  <input type="checkbox" name="familii" value={f.id} checked={checked.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} />
                  <span>
                    {f.nume}
                    <span className="hint inline">
                      {" "}
                      · {f.head ? `cap: ${f.head}` : "fără cap"} · {f.members === 1 ? "un membru" : `${f.members} membri`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : null}
        <button type="submit" className="btn btn-danger mt-2" disabled={dissolving || checked.size === 0}>
          <Icon name="familii" className="size-[18px]" />
          {dissolving ? "Se dizolvă…" : checked.size ? `Dizolvă familiile selectate (${checked.size})` : "Dizolvă familiile selectate"}
        </button>
        <FormMessage state={dissolveState} />
      </form>
    </div>
  );
}
