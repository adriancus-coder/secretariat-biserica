"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { PASSWORD_MIN } from "@/lib/schemas/auth";
import { changePasswordAction } from "@/server/actions/auth";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate>
      <TextField name="current" label="Parola actuală" type="password" autoComplete="current-password" error={e.current} />
      <div className="row2 stack-sm">
        <TextField
          name="password"
          label="Parola nouă"
          type="password"
          autoComplete="new-password"
          error={e.password}
          hint={`Minimum ${PASSWORD_MIN} caractere.`}
        />
        <TextField name="confirm" label="Confirmați parola nouă" type="password" autoComplete="new-password" error={e.confirm} />
      </div>
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Se salvează…" : "Schimbă parola"}
      </button>
    </form>
  );
}
