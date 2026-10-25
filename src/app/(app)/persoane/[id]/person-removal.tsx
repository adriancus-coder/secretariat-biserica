"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/ui/form-bits";
import type { FormState } from "@/lib/form-state";
import { anonymizePersonAction, deletePersonAction } from "@/server/actions/persons";

/**
 * Administrator only, in two steps: "Șterge persoana…" opens the choice (anonymise, keeping the
 * statistics, or delete for good), and a second button confirms it.
 */
export function PersonRemoval({ personId, name }: { personId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"anonimizare" | "stergere">("anonimizare");
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        Șterge persoana…
      </button>
    );
  }
  return (
    <div className="card w-full">
      <h3>Ștergerea datelor: {name}</h3>
      <fieldset className="choices">
        <legend>Ce se întâmplă cu persoana</legend>
        <label className="choice">
          <input type="radio" name="mod" checked={mode === "anonimizare"} onChange={() => setMode("anonimizare")} />
          <span>
            Anonimizează — numele devine „Persoană ștearsă”, datele de contact, notele, funcțiile și mențiunile se șterg; statistica rămâne
            neschimbată.
          </span>
        </label>
        <label className="choice">
          <input type="radio" name="mod" checked={mode === "stergere"} onChange={() => setMode("stergere")} />
          <span>Șterge definitiv — persoana dispare din registru și din statistică; prezența la ședințe și grupurile se șterg.</span>
        </label>
      </fieldset>
      <FormMessage state={state} />
      <div className="actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Renunță
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={pending}
          onClick={() => start(async () => setState(await (mode === "anonimizare" ? anonymizePersonAction(personId) : deletePersonAction(personId))))}
        >
          {pending ? "Se aplică…" : mode === "anonimizare" ? "Confirm anonimizarea" : "Confirm ștergerea definitivă"}
        </button>
      </div>
    </div>
  );
}
