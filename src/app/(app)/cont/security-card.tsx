"use client";

import { useActionState } from "react";
import { RecoveryCodes, TotpQr } from "@/components/two-factor-ui";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import {
  confirmTotpAction,
  disableTotpAction,
  regenerateRecoveryCodesAction,
  setEmailOtpAction,
  startTotpAction,
  type TwoFactorState,
} from "@/server/actions/two-factor";

const init = initialFormState as TwoFactorState;

function Password({ id }: { id: string }) {
  return <TextField name="parola" id={id} label="Parola actuală" type="password" autoComplete="current-password" required />;
}

/** Cont → Securitate: authenticator app, code by e-mail, recovery codes. Every change asks for the password. */
export function SecurityCard({
  totpEnabled,
  emailOtpEnabled,
  recoveryLeft,
  recoveryLegacy,
  emailConfigured,
  required,
}: {
  totpEnabled: boolean;
  emailOtpEnabled: boolean;
  recoveryLeft: number;
  /** Some codes are in the older, shorter format: suggest regenerating them. */
  recoveryLegacy: boolean;
  emailConfigured: boolean;
  required: boolean;
}) {
  const [start, startAction, starting] = useActionState(startTotpAction, init);
  const [confirm, confirmAction, confirming] = useActionState(confirmTotpAction, init);
  const [disable, disableAction, disabling] = useActionState(disableTotpAction, init);
  const [mail, mailAction, mailing] = useActionState(setEmailOtpAction.bind(null, !emailOtpEnabled), init);
  const [regen, regenAction, regenerating] = useActionState(regenerateRecoveryCodesAction, init);
  const codes = confirm.recoveryCodes ?? mail.recoveryCodes ?? regen.recoveryCodes;
  const enrolling = start.ok && !confirm.ok && start.qrSvg && start.secret;

  return (
    <div className="card">
      <h3>Autentificare în doi pași</h3>
      <p className="hint mb-3">
        La autentificare, pe lângă parolă, se cere un cod.
        {required ? " Biserica cere această protecție pentru toți utilizatorii." : ""}
      </p>
      {codes ? <RecoveryCodes codes={codes} /> : null}

      <fieldset className="subfields pb-3">
        <legend>Aplicație de autentificare {totpEnabled ? "· activă" : ""}</legend>
        {enrolling ? (
          <form action={confirmAction} noValidate>
            <TotpQr svg={start.qrSvg!} secret={start.secret!} />
            {totpEnabled ? <p className="hint mb-2">Codurile din aplicația de acum rămân valabile până confirmați aplicația nouă.</p> : null}
            <TextField name="cod" id="cod-totp" label="Codul de 6 cifre din aplicație" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
            <FormMessage state={confirm} />
            <button type="submit" className="btn btn-primary" disabled={confirming}>
              Activează
            </button>
          </form>
        ) : confirm.ok ? (
          <FormMessage state={confirm} />
        ) : totpEnabled ? (
          <>
            <form action={startAction} noValidate className="mb-3">
              <Password id="parola-totp-move" />
              <FormMessage state={start} />
              <button type="submit" className="btn" disabled={starting}>
                Configurează pe alt telefon
              </button>
            </form>
            <form action={disableAction} noValidate>
              <Password id="parola-totp-off" />
              <FormMessage state={disable} />
              <button type="submit" className="btn btn-danger" disabled={disabling}>
                Dezactivează aplicația
              </button>
            </form>
          </>
        ) : (
          <form action={startAction} noValidate>
            <Password id="parola-totp-on" />
            <FormMessage state={start} />
            <button type="submit" className="btn" disabled={starting}>
              Configurează aplicația
            </button>
          </form>
        )}
      </fieldset>

      <fieldset className="subfields pb-3">
        <legend>Cod pe e-mail {emailOtpEnabled ? "· activ" : ""}</legend>
        {!emailOtpEnabled && !emailConfigured ? (
          <p className="hint">Trimiterea pe e-mail nu este configurată; folosiți aplicația de autentificare.</p>
        ) : (
          <form action={mailAction} noValidate>
            <Password id="parola-mail" />
            <FormMessage state={mail} />
            <button type="submit" className={`btn ${emailOtpEnabled ? "btn-danger" : ""}`} disabled={mailing}>
              {emailOtpEnabled ? "Dezactivează codul pe e-mail" : "Activează codul pe e-mail"}
            </button>
          </form>
        )}
      </fieldset>

      {totpEnabled || emailOtpEnabled ? (
        <fieldset className="subfields pb-3">
          <legend>Coduri de recuperare · {recoveryLeft} rămase</legend>
          {recoveryLegacy && !regen.recoveryCodes ? (
            <p className="alert mb-2" role="status">
              Codurile dumneavoastră de recuperare sunt în formatul vechi, mai scurt. Regenerați codurile: cele noi sunt mai sigure, iar cele vechi
              nu mai sunt valabile după regenerare.
            </p>
          ) : null}
          <form action={regenAction} noValidate>
            <Password id="parola-regen" />
            <FormMessage state={regen} />
            <button type="submit" className="btn" disabled={regenerating}>
              Generează coduri noi
            </button>
          </form>
        </fieldset>
      ) : null}
    </div>
  );
}
