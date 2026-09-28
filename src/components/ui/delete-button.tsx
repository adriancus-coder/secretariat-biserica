"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form-state";
import { initialFormState } from "@/lib/form-state";

/** Buton de ștergere cu confirmare; acțiunea primește deja id-ul (bind pe server). */
export function DeleteButton({
  action,
  confirmMessage,
  label = "Șterge",
}: {
  action: () => Promise<FormState>;
  confirmMessage: string;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(async () => action(), initialFormState);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
      className="inline-flex flex-col"
    >
      <button type="submit" className="btn btn-danger" disabled={pending}>
        {pending ? "Se șterge…" : label}
      </button>
      {state.message ? (
        <span className="field-error" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
