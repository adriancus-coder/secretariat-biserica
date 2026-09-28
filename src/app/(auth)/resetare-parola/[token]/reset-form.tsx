"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { PASSWORD_MIN } from "@/lib/schemas/auth";
import { resetPasswordAction } from "@/server/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction.bind(null, token), initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate>
      <TextField
        name="password"
        label="Parola nouă"
        type="password"
        autoComplete="new-password"
        error={e.password}
        hint={`Minimum ${PASSWORD_MIN} caractere.`}
        required
      />
      <TextField name="confirm" label="Confirmați parola" type="password" autoComplete="new-password" error={e.confirm} required />
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Se salvează…" : "Salvează parola"}
      </button>
    </form>
  );
}
