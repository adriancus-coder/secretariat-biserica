"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form-state";
import { initialFormState } from "@/lib/form-state";

/** "Atribuie număr": gives a meeting saved without a number the next free one of its year. */
export function AssignNumberButton({ action }: { action: () => Promise<FormState> }) {
  const [state, run, pending] = useActionState(async () => action(), initialFormState);
  return (
    <form action={run}>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Se atribuie…" : "Atribuie număr"}
      </button>
      {state.message && !state.ok ? (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
