"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmStepUpAction, presenceOptionsAction } from "@/server/actions/passkeys";
import { PasskeyButton } from "./passkey-button";

/**
 * "Confirmați identitatea": shown instead of a sensitive page or before a sensitive action. With a
 * passkey: the device unlock; without: the password. Valid 15 minutes for this session.
 */
export function StepUpGate({ method, what, compact = false }: { method: "passkey" | "password"; what: string; compact?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={compact ? "alert mb-4" : "card"} role="region" aria-label="Confirmarea identității">
      {compact ? null : <h3>Confirmați identitatea</h3>}
      <p className={compact ? "m-0 mb-2" : "hint mb-3"}>
        {what} {method === "passkey" ? "Confirmați cu Face ID, amprenta sau PIN-ul dispozitivului." : "Introduceți parola contului."} Confirmarea este valabilă 15
        minute.
      </p>
      {method === "passkey" ? (
        <PasskeyButton
          label="Confirmă pe acest dispozitiv"
          getOptions={() => presenceOptionsAction("confirmare")}
          onResponse={(response) => confirmStepUpAction({ response })}
          onDone={(s) => (s.ok ? router.refresh() : undefined)}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await confirmStepUpAction({ password });
              if (r.ok) {
                setPassword("");
                router.refresh();
              } else setError(r.message ?? "Parola nu este corectă.");
            });
          }}
          className="flex flex-wrap gap-2 items-end"
        >
          <div className="field !mb-0 grow">
            <label htmlFor="step-up-password">Parola</label>
            <input id="step-up-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Se verifică…" : "Confirmă"}
          </button>
          {error ? (
            <p className="field-error w-full" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
