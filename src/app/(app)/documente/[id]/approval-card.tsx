"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { SignDocument, type SignChoice } from "@/components/sign-document";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState, type FormState } from "@/lib/form-state";

/**
 * The pastor's approval (Statut art. 38–39): the secretary sends the document; the pastor approves and
 * signs (drawn now or saved after the device unlock) or rejects it with a reason.
 */
export function ApprovalCard({
  stare,
  stareLabel,
  info,
  motiv,
  canSend,
  send,
  pastor,
}: {
  stare: "CIORNA" | "DE_SEMNAT" | "APROBAT" | "RESPINS";
  stareLabel: string;
  /** "trimis la …", "aprobat la … de …". */
  info: string | null;
  motiv: string;
  canSend: boolean;
  send: () => Promise<FormState>;
  /** The pastor's step on a document sent for signature. */
  pastor: {
    documentId: string;
    me: string;
    approve: (choice: SignChoice) => Promise<FormState>;
    reject: (prev: FormState, fd: FormData) => Promise<FormState>;
    canUseSaved: boolean;
    savedHint: string | null;
    freshOnly: boolean;
  } | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<FormState | null>(null);
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [rejectState, reject, rejectPending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await pastor!.reject(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, initialFormState);
  return (
    <div className={`card ${stare === "APROBAT" ? "" : "approval-pending"}`}>
      <h3>Aprobarea pastorului</h3>
      <p className="m-0">
        <span className={`tag ${stare === "APROBAT" ? "tag-ok" : stare === "RESPINS" ? "tag-warn" : "tag-gold"}`}>{stareLabel}</span> {info ? <span className="hint inline">{info}</span> : null}
      </p>
      {stare === "RESPINS" && motiv ? <p className="alert mt-2">Motivul respingerii: {motiv}</p> : null}
      {stare !== "APROBAT" ? (
        <p className="hint">Documentul nu este încă aprobat de pastor. Până la aprobare, PDF-ul și fișierul Word poartă mențiunea „CIORNĂ — neaprobat”, fără semnătura pastorului, și nu pot fi eliberate.</p>
      ) : null}
      {canSend && (stare === "CIORNA" || stare === "RESPINS") ? (
        <div className="actions !justify-start">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await send();
                setMsg(r);
                if (r.ok) router.refresh();
              })
            }
          >
            Trimite pastorului spre semnare
          </button>
        </div>
      ) : null}
      {msg?.message ? <FormMessage state={msg} /> : null}
      {pastor && stare === "DE_SEMNAT" ? (
        <div className="mt-3 grid gap-3">
          <SignDocument
            documentId={pastor.documentId}
            signer={pastor.me}
            label="Aprobă și semnează"
            canUseSaved={pastor.canUseSaved}
            savedHint={pastor.savedHint}
            freshOnly={pastor.freshOnly}
            onSign={pastor.approve}
          />
          {rejecting ? (
            <form action={reject} className="grid gap-2">
              <div className="field !mb-0">
                <label htmlFor="motiv-respingere">Motivul respingerii</label>
                <textarea id="motiv-respingere" name="motiv" rows={3} maxLength={1000} required />
              </div>
              <FormMessage state={rejectState} />
              <div className="flex gap-2">
                <button type="submit" className="btn btn-danger" disabled={rejectPending}>
                  Respinge
                </button>
                <button type="button" className="btn" onClick={() => setRejecting(false)}>
                  Renunță
                </button>
              </div>
            </form>
          ) : (
            <div>
              <button type="button" className="btn" onClick={() => setRejecting(true)}>
                Respinge…
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
