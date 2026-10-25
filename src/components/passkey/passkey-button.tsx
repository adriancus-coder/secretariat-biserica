"use client";

import { startAuthentication, WebAuthnError, type AuthenticationResponseJSON, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { useState, useTransition } from "react";
import type { FormState } from "@/lib/form-state";

type Options = { options: PublicKeyCredentialRequestOptionsJSON } | { error: string };

/** Romanian text for the browser's refusals (cancelled, timed out, no matching device). */
export function webAuthnMessage(e: unknown): string {
  if (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED") return "Confirmarea a fost anulată.";
  if (e instanceof Error && e.name === "NotAllowedError") return "Confirmarea a fost anulată sau a expirat. Încercați din nou.";
  return "Dispozitivul nu a putut confirma. Încercați din nou.";
}

/**
 * A button that asks the device's own unlock (Face ID, fingerprint, screen PIN) through a passkey:
 * fetches server-issued options, runs the browser ceremony and sends the answer to `onResponse`.
 */
export function PasskeyButton({
  getOptions,
  onResponse,
  label,
  className = "btn btn-primary",
  onDone,
}: {
  getOptions: () => Promise<Options>;
  onResponse: (response: AuthenticationResponseJSON) => Promise<FormState | void>;
  label: string;
  className?: string;
  onDone?: (state: FormState) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const opts = await getOptions();
            if ("error" in opts) return setError(opts.error);
            let response: AuthenticationResponseJSON;
            try {
              response = await startAuthentication({ optionsJSON: opts.options });
            } catch (e) {
              return setError(webAuthnMessage(e));
            }
            const state = (await onResponse(response)) ?? { ok: true };
            if (state.message && !state.ok) setError(state.message);
            onDone?.(state);
          })
        }
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 11v3m-4-5a4 4 0 1 1 8 0v1m-10 4c0-1.5.4-2.9 1-4m12 4a10 10 0 0 1-1 4.4M9 21c.6-1.3 1-2.8 1-4.3V14m4 7.5c.4-1 .7-2 .9-3" strokeLinecap="round" />
        </svg>
        {pending ? "Se așteaptă dispozitivul…" : label}
      </button>
      {error ? (
        <p className="field-error mt-1" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
