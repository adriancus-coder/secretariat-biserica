"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { PASSWORD_MIN } from "@/lib/schemas/auth";
import { signupAction } from "@/server/actions/auth";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate>
      <TextField
        name="churchName"
        label="Numele bisericii"
        placeholder="ex. Maranata Stavanger"
        defaultValue={v.churchName ?? ""}
        error={e.churchName}
        required
      />
      <TextField name="name" label="Numele dumneavoastră" defaultValue={v.name ?? ""} error={e.name} required />
      <TextField
        name="email"
        label="E-mail"
        type="email"
        autoComplete="username"
        defaultValue={v.email ?? ""}
        error={e.email}
        required
      />
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
        {pending ? "Se creează…" : "Creează contul bisericii"}
      </button>
    </form>
  );
}
