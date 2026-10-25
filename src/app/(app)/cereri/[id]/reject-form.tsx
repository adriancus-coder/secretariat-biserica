"use client";

import { useState } from "react";
import { TextAreaField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { rejectApplicationAction } from "@/server/actions/applications";

export function RejectForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useActionForm(rejectApplicationAction.bind(null, id));
  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Respinge
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="card w-full">
      <h3>Respinge cererea</h3>
      <TextAreaField name="motiv" label="Motiv (opțional)" defaultValue={state.values?.motiv ?? ""} error={state.errors?.motiv} maxLength={500} />
      <FormMessage state={state} />
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Renunță
        </button>
        <button type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "Se salvează…" : "Respinge cererea"}
        </button>
      </div>
    </form>
  );
}
