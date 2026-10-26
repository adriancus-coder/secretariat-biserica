"use client";

import { useState } from "react";
import { TextAreaField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { rejectProposalAction } from "@/server/actions/pastor-proposals";

export function RejectProposalForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useActionForm(rejectProposalAction.bind(null, id));
  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Respinge
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="card w-full">
      <h3>Respinge propunerea</h3>
      <TextAreaField name="motiv" label="Motiv (îl vede secretariatul)" defaultValue={state.values?.motiv ?? ""} error={state.errors?.motiv} maxLength={500} />
      <FormMessage state={state} />
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Renunță
        </button>
        <button type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "Se salvează…" : "Respinge propunerea"}
        </button>
      </div>
    </form>
  );
}
