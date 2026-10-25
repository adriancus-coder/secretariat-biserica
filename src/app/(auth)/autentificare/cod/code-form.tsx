"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { sendLoginEmailCodeAction, verifyLoginCodeAction } from "@/server/actions/two-factor";

export function CodeForm({ canEmail }: { canEmail: boolean }) {
  const [state, action, pending] = useActionState(verifyLoginCodeAction, initialFormState);
  const [mailState, mail, mailing] = useActionState(async () => sendLoginEmailCodeAction(), initialFormState);
  return (
    <>
      <form action={action} noValidate>
        <TextField
          name="cod"
          label="Cod"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={20}
          hint="Puteți folosi și un cod de recuperare (de forma abcd-efgh-jkmn)."
        />
        <FormMessage state={state} />
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Se verifică…" : "Confirmă"}
        </button>
      </form>
      {canEmail ? (
        <form action={mail} className="mt-3">
          <button type="submit" className="btn w-full" disabled={mailing}>
            {mailing ? "Se trimite…" : "Trimite codul pe e-mail"}
          </button>
          <FormMessage state={mailState} />
        </form>
      ) : null}
    </>
  );
}
