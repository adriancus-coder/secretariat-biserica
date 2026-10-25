"use client";

import { useActionState, useState, useTransition } from "react";
import { RecoveryCodes, TotpQr } from "@/components/two-factor-ui";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import {
  confirmSetupAction,
  finishSetupAction,
  sendLoginEmailCodeAction,
  startSetupTotpAction,
  type TwoFactorState,
} from "@/server/actions/two-factor";

export function SetupForm({ canEmail }: { canEmail: boolean }) {
  const [method, setMethod] = useState<"totp" | "email" | null>(null);
  const [qr, setQr] = useState<TwoFactorState | null>(null);
  const [mailState, setMailState] = useState<TwoFactorState | null>(null);
  const [pending, start] = useTransition();
  const [state, confirm, confirming] = useActionState(confirmSetupAction, initialFormState as TwoFactorState);
  const [finishState, finish, finishing] = useActionState(async () => finishSetupAction(), initialFormState);

  if (state.recoveryCodes) {
    return (
      <form action={finish}>
        <RecoveryCodes codes={state.recoveryCodes} />
        <FormMessage state={finishState} />
        <button type="submit" className="btn btn-primary w-full" disabled={finishing}>
          {finishing ? "Se deschide…" : "Am notat codurile, continuă"}
        </button>
      </form>
    );
  }
  return (
    <>
      <div className="grid gap-2 mb-4">
        <button
          type="button"
          className="choice"
          aria-pressed={method === "totp"}
          onClick={() => {
            setMethod("totp");
            if (!qr) start(async () => setQr(await startSetupTotpAction()));
          }}
        >
          Aplicație de autentificare pe telefon (recomandat)
        </button>
        {canEmail ? (
          <button
            type="button"
            className="choice"
            aria-pressed={method === "email"}
            onClick={() => {
              setMethod("email");
              start(async () => setMailState(await sendLoginEmailCodeAction()));
            }}
          >
            Cod trimis pe e-mail
          </button>
        ) : null}
      </div>
      {method === "totp" && qr?.qrSvg && qr.secret ? <TotpQr svg={qr.qrSvg} secret={qr.secret} /> : null}
      {method === "email" && mailState ? <FormMessage state={mailState} /> : null}
      {method && !pending ? (
        <form action={confirm} noValidate>
          <input type="hidden" name="metoda" value={method} />
          <TextField name="cod" label="Codul de 6 cifre" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
          <FormMessage state={state} />
          <button type="submit" className="btn btn-primary w-full" disabled={confirming}>
            {confirming ? "Se verifică…" : "Activează"}
          </button>
        </form>
      ) : null}
    </>
  );
}
