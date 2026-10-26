"use client";

import { useState } from "react";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { retireAssetAction } from "@/server/actions/assets";

/** "Scoate din uz": the date and the reason; the good stays in the inventory's history. */
export function RetireForm({ id, today }: { id: string; today: string }) {
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useActionForm(retireAssetAction.bind(null, id));
  const e = state.errors ?? {};
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Scoate din uz
      </button>
    );
  return (
    <form onSubmit={onSubmit} noValidate className="card">
      <h3>Scoate din uz</h3>
      <p className="hint mb-3">Bunul nu se șterge: rămâne în istoricul inventarului, cu data și motivul.</p>
      <div className="row2">
        <TextField name="dataIesirii" label="Data" type="date" defaultValue={today} error={e.dataIesirii} required />
        <TextField name="motivIesirii" label="Motivul" error={e.motivIesirii} required autoComplete="off" />
      </div>
      <FormMessage state={state} />
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Renunță
        </button>
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : "Scoate din uz"}
        </button>
      </div>
    </form>
  );
}
