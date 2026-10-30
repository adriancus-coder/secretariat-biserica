"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteRoleSignatureAction,
  deleteSignatureAction,
  lockMeetingAction,
  markAllPaperAction,
  markPaperAction,
  signMeetingAction,
  signRoleAction,
  unlockMeetingAction,
} from "@/server/actions/signatures";
import { SignaturePad } from "@/components/signature-pad";
import { missingLine } from "@/lib/minutes-signatures";

export interface SignatureRow {
  /** `p:<personId>` for a person present, `r:SECRETAR` / `r:PASTOR` for the bottom places. */
  place: string;
  /** „Secretar” / „Pastor” for the bottom places. */
  role?: string;
  name: string;
  /** PNG as a data URL of a drawn signature. */
  image: string | null;
  /** Signed in the app or marked on paper. */
  signed: boolean;
  paper: boolean;
  /** „semnat 11.09.2026 14:03”, „semnat pe hârtie 11.09.2026 14:03 · marcat de Ana Pop”, „nesemnat”. */
  state: string;
}

type Confirm = { kind: "all" | "close"; names: string[] } | null;

/**
 * MINUTES-SIGNATURES: the signatures of those present (not the Secretar and the Pastor, who sign at the
 * bottom), then the bottom places; each signed on the pad or marked „Semnat pe hârtie”; closing and
 * reopening the minutes.
 */
export function Signatures({
  meetingId,
  rows,
  roles,
  emptyText = "Nicio persoană prezentă care semnează în tabel.",
  locked,
  canWrite,
  canUnlock,
}: {
  meetingId: string;
  rows: SignatureRow[];
  roles: SignatureRow[];
  /** Shown when nobody signs in the table (ATTENDANCE-COUNT: the attendance is only a number). */
  emptyText?: string;
  locked: boolean;
  canWrite: boolean;
  canUnlock: boolean;
}) {
  const router = useRouter();
  const [signing, setSigning] = useState<SignatureRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
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
  const open = canWrite && !locked;
  const label = (r: SignatureRow) => (r.role ? `${r.role} ${r.name}` : r.name);
  const unsigned = [...rows, ...roles].filter((r) => !r.signed).map(label);
  const undo = (r: SignatureRow) => (r.place.startsWith("r:") ? deleteRoleSignatureAction(meetingId, r.place.slice(2)) : deleteSignatureAction(meetingId, r.place.slice(2)));

  const row = (r: SignatureRow) => (
    <li key={r.place}>
      <span className="min-w-0">
        <span className="block">
          {r.role ? <strong>{r.role}: </strong> : null}
          {r.name}
        </span>
        <span className="hint !mt-0">{r.state}</span>
      </span>
      {r.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image} alt={`Semnătura: ${r.name}`} className="sign-thumb" />
      ) : null}
      {open ? (
        <span className="flex gap-2 flex-wrap justify-end">
          {!r.signed ? (
            <>
              <button type="button" className="btn btn-sm" onClick={() => setSigning(r)} disabled={pending}>
                Semnează
              </button>
              <button type="button" className="btn btn-sm" onClick={() => run(() => markPaperAction(meetingId, r.place))} disabled={pending}>
                Semnat pe hârtie
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => run(() => undo(r))}>
              {r.paper ? "Anulează „pe hârtie”" : "Șterge semnătura"}
            </button>
          )}
        </span>
      ) : null}
    </li>
  );

  return (
    <div className="card" id="semnaturi">
      <h3>Semnături</h3>
      {open && unsigned.length ? (
        <div className="mb-2">
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => setConfirm({ kind: "all", names: unsigned })}>
            Toți au semnat pe hârtie
          </button>
        </div>
      ) : null}
      {confirm ? (
        <div className="alert mb-3" role="alertdialog" aria-labelledby="semnaturi-confirmare">
          <p id="semnaturi-confirmare" className="!mt-0">
            {confirm.kind === "all"
              ? `Se marchează „semnat pe hârtie”: ${confirm.names.join(", ")}.`
              : `${missingLine(confirm.names)} Închideți procesul-verbal oricum? După închidere nu mai poate fi modificat.`}
          </p>
          <div className="flex gap-2 flex-wrap mt-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() => run(() => (confirm.kind === "all" ? markAllPaperAction(meetingId) : lockMeetingAction(meetingId, true)), () => setConfirm(null))}
            >
              {confirm.kind === "all" ? "✓ Da, toți au semnat pe hârtie" : "Închide oricum"}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => setConfirm(null)}>
              Renunță
            </button>
          </div>
        </div>
      ) : null}
      {rows.length ? <ul className="sign-list">{rows.map(row)}</ul> : <p className="hint">{emptyText}</p>}
      {roles.length ? (
        <>
          <h4 className="mt-3 mb-1 text-sm font-semibold">Întocmit</h4>
          <ul className="sign-list">{roles.map(row)}</ul>
        </>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <div className="mt-3">
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => (unsigned.length ? setConfirm({ kind: "close", names: unsigned }) : run(() => lockMeetingAction(meetingId, false)))}
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
          name={label(signing)}
          busy={pending}
          onCancel={() => setSigning(null)}
          onConfirm={(png) =>
            run(
              () => (signing.place.startsWith("r:") ? signRoleAction(meetingId, signing.place.slice(2), png) : signMeetingAction(meetingId, signing.place.slice(2), png)),
              () => setSigning(null),
            )
          }
        />
      ) : null}
    </div>
  );
}
