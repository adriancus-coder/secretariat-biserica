"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { loginAction } from "@/server/actions/auth";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <TextField
        name="email"
        label="E-mail"
        type="email"
        autoComplete="username"
        inputMode="email"
        defaultValue={state.values?.email ?? ""}
        required
        autoFocus
      />
      <TextField name="password" label="Parolă" type="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Se verifică…" : "Intră în cont"}
      </button>
    </form>
  );
}
