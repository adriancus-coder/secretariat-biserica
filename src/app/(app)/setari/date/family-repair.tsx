"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { dissolveAutoFamiliesAction, recalcHeadsAction, type RecalcHeadsState } from "@/server/actions/families";

/** One-time repairs of the families created automatically (from the old family text). Admin only. */
export function FamilyRepair({ autoCount }: { autoCount: number }) {
  const [dissolveState, dissolve, dissolving] = useActionState(async () => dissolveAutoFamiliesAction(), initialFormState);
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
          if (!window.confirm(`Dizolvați ${autoCount === 1 ? "familia creată automat" : `cele ${autoCount} familii create automat`}? Membrii rămân în registru, fără familie.`)) {
            e.preventDefault();
          }
        }}
      >
        <button type="submit" className="btn btn-danger" disabled={dissolving || autoCount === 0}>
          {dissolving ? "Se dizolvă…" : "Dizolvă familiile create automat"}
        </button>
        <FormMessage state={dissolveState} />
      </form>
    </div>
  );
}
