"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSignatureAction, lockMeetingAction, signMeetingAction, unlockMeetingAction } from "@/server/actions/signatures";
import { SignaturePad } from "./signature-pad";

export interface SignatureRow {
  id: string;
  name: string;
  /** PNG as a data URL, with the time it was signed ("11.09.2026 14:03"). */
  image: string | null;
  signedAt: string | null;
}

/** The present attendees' signatures, and closing / reopening the minutes. */
export function Signatures({
  meetingId,
  rows,
  locked,
  canWrite,
  canUnlock,
}: {
  meetingId: string;
  rows: SignatureRow[];
  locked: boolean;
  canWrite: boolean;
  canUnlock: boolean;
}) {
  const router = useRouter();
  const [signing, setSigning] = useState<SignatureRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok?: boolean; message?: string }>, done?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setError(null);
        done?.();
        router.refresh();
      } else setError(r.message ?? "A apărut o eroare.");
    });
  const unsigned = rows.filter((r) => !r.image);

  return (
    <div className="card">
      <h3>Semnături</h3>
      {rows.length ? (
        <ul className="sign-list">
          {rows.map((r) => (
            <li key={r.id}>
              <span className="min-w-0">
                <span className="block">{r.name}</span>
                {r.image ? <span className="hint !mt-0">semnat {r.signedAt}</span> : <span className="hint !mt-0">nesemnat</span>}
              </span>
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image} alt={`Semnătura: ${r.name}`} className="sign-thumb" />
              ) : null}
              {canWrite && !locked ? (
                <span className="flex gap-2 flex-wrap justify-end">
                  {!r.image ? (
                    <button type="button" className="btn btn-sm" onClick={() => setSigning(r)} disabled={pending}>
                      Semnează
                    </button>
                  ) : (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => run(() => deleteSignatureAction(meetingId, r.id))} disabled={pending}>
                      Șterge semnătura
                    </button>
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nicio persoană prezentă.</p>
      )}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {canWrite && !locked ? (
        <div className="mt-3">
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              const ok =
                !unsigned.length ||
                window.confirm(`Nu au semnat: ${unsigned.map((r) => r.name).join(", ")}.\n\nÎnchideți procesul-verbal oricum? După închidere nu mai poate fi modificat.`);
              if (ok) run(() => lockMeetingAction(meetingId, unsigned.length > 0));
            }}
          >
            Închide procesul-verbal
          </button>
        </div>
      ) : null}
      {locked && canUnlock ? (
        <div className="mt-3">
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => unlockMeetingAction(meetingId))}>
            Redeschide procesul-verbal
          </button>
        </div>
      ) : null}
      {signing ? (
        <SignaturePad
          name={signing.name}
          busy={pending}
          onCancel={() => setSigning(null)}
          onConfirm={(png) => run(() => signMeetingAction(meetingId, signing.id, png), () => setSigning(null))}
        />
      ) : null}
    </div>
  );
}
