"use client";

import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import type { FormState } from "@/lib/form-state";

/** Step 1: "Confirmați identitatea" (the same for a personal and the general link). */
export function IdentityForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const { state, pending, onSubmit } = useActionForm(action);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate className="card">
      <h3>Confirmați identitatea</h3>
      <p className="hint mb-3">Scrieți numele complet și numărul de telefon, așa cum le-ați dat bisericii.</p>
      <TextField name="nume" label="Nume complet" autoComplete="name" defaultValue={v.nume ?? ""} error={e.nume} required />
      <TextField name="telefon" label="Număr de telefon" type="tel" autoComplete="tel" inputMode="tel" defaultValue={v.telefon ?? ""} error={e.telefon} required />
      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <FormMessage state={state} />
      <div className="actions">
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se verifică…" : "Continuă"}
        </button>
      </div>
    </form>
  );
}
