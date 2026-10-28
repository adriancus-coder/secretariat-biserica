"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import type { FormState } from "@/lib/form-state";
import type { RegisterChange } from "@/lib/event-persons";
import { applyEventRegisterAction, ignoreEventRegisterAction } from "@/server/actions/event-persons";

/*
 * EVENT-PERSONS: „Trece în registru” on the page of an event that has taken place: one tick per proposed
 * change (a field already holding another value shows „actual → propus”, unticked); nothing is written
 * before „Aplică selecția”.
 */
export function RegisterCard({ eventId, changes }: { eventId: string; changes: RegisterChange[] }) {
  const { state, pending, onSubmit } = useActionForm(applyEventRegisterAction.bind(null, eventId));
  const persons = [...new Set(changes.map((c) => c.personId))];
  return (
    <form className="card" onSubmit={onSubmit} aria-labelledby="registru-title">
      <h3 id="registru-title">Trece în registru</h3>
      {changes.length ? (
        <p className="hint mb-2">Bifați ce se trece pe fișele persoanelor. Nimic nu se scrie până nu apăsați „Aplică selecția”.</p>
      ) : (
        <p className="hint mb-2">Registrul are deja aceste date.</p>
      )}
      {persons.map((pid) => {
        const rows = changes.filter((c) => c.personId === pid);
        return (
          <fieldset key={pid} className="register-person">
            <legend className="font-semibold">{rows[0].person}</legend>
            {rows.map((c) => (
              <label key={c.key} className="check">
                <input type="checkbox" name="schimbare" value={c.key} defaultChecked={c.checked} />
                <span className="min-w-0">
                  {c.label}: {c.current !== "—" ? (
                    <>
                      <span className="hint inline">{c.current}</span> → <b className="font-semibold">{c.proposed}</b>
                    </>
                  ) : (
                    <b className="font-semibold">{c.proposed}</b>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}
      <FormMessage state={state} />
      <div className="actions">
        <IgnoreRegisterButton eventId={eventId} />
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se aplică…" : "✓ Aplică selecția"}
        </button>
      </div>
    </form>
  );
}

/** „Ignoră”: the event stops asking (Acasă and the event page). */
export function IgnoreRegisterButton({ eventId }: { eventId: string }) {
  const [busy, start] = useTransition();
  const [state, setState] = useState<FormState>();
  return (
    <>
      <button type="button" className="btn" disabled={busy} onClick={() => start(async () => setState(await ignoreEventRegisterAction(eventId)))}>
        {busy ? "Se ignoră…" : "Ignoră"}
      </button>
      {state && !state.ok ? <FormMessage state={state} /> : null}
    </>
  );
}
