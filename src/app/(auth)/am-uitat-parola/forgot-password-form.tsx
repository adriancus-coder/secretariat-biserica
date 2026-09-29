"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Icon } from "@/components/shell/icons";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { forgotPasswordAction } from "@/server/actions/auth";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialFormState);
  return (
    <form action={action} noValidate>
      <TextField
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={state.values?.email ?? ""}
        error={state.errors?.email}
        required
        autoFocus
      />
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary w-full min-h-11" disabled={pending}>
        <Icon name="email" className="size-[18px]" />
        {pending ? "Se trimite…" : "Trimite linkul"}
      </button>
      <Link href="/autentificare" className="btn w-full min-h-11 mt-3">
        Înapoi la autentificare
      </Link>
    </form>
  );
}
