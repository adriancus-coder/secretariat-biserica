"use client";

import { startAuthentication, type AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { webAuthnMessage } from "@/components/passkey/passkey-button";
import { SignaturePad } from "@/components/signature-pad";
import type { FormState } from "@/lib/form-state";
import { presenceOptionsAction } from "@/server/actions/passkeys";

export type SignChoice = { mode: "UNICA"; png: string } | { mode: "SALVATA"; response: AuthenticationResponseJSON };

/**
 * One signing step: "Semnează acum" (full-screen pad; the drawing stays on this document only) or
 * "Folosește semnătura salvată", which always asks the device unlock for this exact document.
 */
export function SignDocument({
  documentId,
  signer,
  label,
  canUseSaved,
  savedHint,
  freshOnly,
  onSign,
}: {
  documentId: string;
  /** The signer's name, shown on the pad. */
  signer: string;
  /** "Semnează" / "Aprobă și semnează". */
  label: string;
  canUseSaved: boolean;
  /** Why the saved signature is not available (no passkey, nothing saved). */
  savedHint: string | null;
  /** The church wants a drawing each time for this document. */
  freshOnly: boolean;
  onSign: (choice: SignChoice) => Promise<FormState>;
}) {
  const router = useRouter();
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = (r: FormState) => {
    if (r.ok) router.refresh();
    else setError(r.message ?? "Semnarea nu a reușit.");
  };
  return (
    <div className="sign-document">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => setDrawing(true)}>
          {label}: semnează acum
        </button>
        {freshOnly ? null : (
          <button
            type="button"
            className="btn"
            disabled={pending || !canUseSaved}
            onClick={() =>
              start(async () => {
                setError(null);
                const opts = await presenceOptionsAction(`semnatura:${documentId}`);
                if ("error" in opts) return setError(opts.error);
                try {
                  const response = await startAuthentication({ optionsJSON: opts.options });
                  done(await onSign({ mode: "SALVATA", response }));
                } catch (e) {
                  setError(webAuthnMessage(e));
                }
              })
            }
          >
            Folosește semnătura salvată
          </button>
        )}
      </div>
      {!freshOnly && !canUseSaved && savedHint ? <p className="hint !mt-1">{savedHint}</p> : null}
      {freshOnly ? <p className="hint !mt-1">Pentru acest document semnătura se desenează de fiecare dată.</p> : null}
      {error ? (
        <p className="field-error mt-1" role="alert">
          {error}
        </p>
      ) : null}
      {drawing ? (
        <SignaturePad
          name={signer}
          busy={pending}
          onCancel={() => setDrawing(false)}
          onConfirm={(png) =>
            start(async () => {
              setError(null);
              const r = await onSign({ mode: "UNICA", png });
              setDrawing(false);
              done(r);
            })
          }
        />
      ) : null}
    </div>
  );
}
