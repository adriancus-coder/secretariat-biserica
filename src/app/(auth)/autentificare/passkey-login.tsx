"use client";

import { PasskeyButton } from "@/components/passkey/passkey-button";
import { loginPasskeyAction, loginPasskeyOptionsAction, secondFactorPasskeyAction, secondFactorPasskeyOptionsAction } from "@/server/actions/passkeys";

/** "Intră cu Face ID / amprentă" on /autentificare: a passkey of this device, no e-mail typed. */
export function PasskeyLogin({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="mt-3">
      <PasskeyButton
        label="Intră cu Face ID / amprentă"
        className="btn w-full justify-center"
        getOptions={() => loginPasskeyOptionsAction()}
        onResponse={(response) => loginPasskeyAction(response, callbackUrl)}
      />
    </div>
  );
}

/** The second step after the password: "Confirmă cu Face ID / amprentă". */
export function PasskeySecondFactor() {
  return (
    <PasskeyButton
      label="Confirmă cu Face ID / amprentă"
      className="btn btn-primary w-full justify-center"
      getOptions={() => secondFactorPasskeyOptionsAction()}
      onResponse={(response) => secondFactorPasskeyAction(response)}
    />
  );
}
