"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { PASSWORD_MIN } from "@/lib/schemas/auth";
import { acceptInvitationAction } from "@/server/actions/auth";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction.bind(null, token), initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate>
      <TextField name="name" label="Numele complet" autoComplete="name" defaultValue={state.values?.name ?? ""} error={e.name} required />
      <div className="row2 stack-sm">
        <TextField
          name="password"
          label="Parolă"
          type="password"
          autoComplete="new-password"
          error={e.password}
          hint={`Minimum ${PASSWORD_MIN} caractere.`}
          required
        />
        <TextField name="confirm" label="Confirmați parola" type="password" autoComplete="new-password" error={e.confirm} required />
      </div>
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Se creează contul…" : "Creează contul"}
      </button>
    </form>
  );
}
