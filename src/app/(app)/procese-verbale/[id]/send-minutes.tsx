"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/shell/icons";
import { TextAreaField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { sendMinutesAction } from "@/server/actions/meeting-send";

export interface Recipient {
  email: string;
  /** "Pastor", "Secretar" or the attendee's name. */
  label: string;
  preselected: boolean;
}

/** "Trimite": e-mails the minutes from a dialog (recipient chips, other addresses, subject, message, PDF). */
export function SendMinutesButton({
  meetingId,
  configured,
  recipients,
  subject,
  frame,
}: {
  meetingId: string;
  /** False when e-mail is not set up: the button is disabled with a note. */
  configured: boolean;
  recipients: Recipient[];
  /** The fixed subject. */
  subject: string;
  /** The fixed start and end of the message, shown around the editable note. */
  frame: { start: string; end: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // A new key remounts the form, so every opening starts from the defaults.
  const [formKey, setFormKey] = useState(0);

  if (!configured) {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <button type="button" className="btn" disabled aria-describedby="send-off">
          <Icon name="email" className="size-[18px]" /> Trimite
        </button>
        <span id="send-off" className="text-xs text-ink-3">
          Trimiterea pe e-mail nu este configurată.
        </span>
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setFormKey((k) => k + 1);
          dialog.current?.showModal();
        }}
      >
        <Icon name="email" className="size-[18px]" /> Trimite
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby="send-title">
        <SendForm
          key={formKey}
          meetingId={meetingId}
          recipients={recipients}
          subject={subject}
          frame={frame}
          onClose={() => dialog.current?.close()}
        />
      </dialog>
    </>
  );
}

function SendForm({
  meetingId,
  recipients,
  subject,
  frame,
  onClose,
}: {
  meetingId: string;
  recipients: Recipient[];
  subject: string;
  frame: { start: string; end: string };
  onClose: () => void;
}) {
  const { state, pending, onSubmit } = useActionForm(sendMinutesAction.bind(null, meetingId));
  const e = state.errors ?? {};
  // Close shortly after a successful send; the page shows it under "Trimiteri".
  useEffect(() => {
    if (!state.ok) return;
    const t = setTimeout(onClose, 1500);
    return () => clearTimeout(t);
  }, [state, onClose]);

  return (
    <form onSubmit={onSubmit} noValidate>
      <h3 id="send-title">Trimite procesul-verbal</h3>
      <FormMessage state={state} />
      {recipients.length ? (
        <fieldset className="choices send-recipients">
          <legend>Destinatari</legend>
          {recipients.map((r) => (
            <label key={r.email} className="choice">
              <input type="checkbox" name="catre" value={r.email} defaultChecked={r.preselected} />
              <span className="tick" aria-hidden="true">
                <Icon name="bifa" className="size-[14px]" />
              </span>
              <span className="min-w-0">
                {r.label}
                <span className="block truncate text-xs font-normal text-ink-3">{r.email}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <TextAreaField
        name="alte"
        label="Alte adrese"
        rows={2}
        placeholder="ex. ana@exemplu.ro, ion@exemplu.no"
        hint="Separate prin virgulă sau pe rânduri diferite."
        error={e.alte}
        className="[&_textarea]:!min-h-[64px]"
        autoComplete="off"
        spellCheck={false}
      />
      <p className="hint mb-2">
        Subiect: <b>{subject}</b>
      </p>
      <TextAreaField
        name="nota"
        label="Mesaj (opțional)"
        defaultValue={state.values?.nota ?? ""}
        error={e.nota}
        rows={4}
        maxLength={1000}
        hint={`E-mailul începe cu „${frame.start}” și se încheie cu „${frame.end}”. Aici puteți adăuga câteva rânduri (cel mult 1000 de caractere).`}
      />
      <label className="choice">
        <input type="checkbox" name="pdf" defaultChecked />
        <span className="tick" aria-hidden="true">
          <Icon name="bifa" className="size-[14px]" />
        </span>
        Atașează PDF
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={pending || state.ok}>
          <Icon name="email" className="size-[18px]" /> {pending ? "Se trimite…" : "Trimite"}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Închide
        </button>
      </div>
    </form>
  );
}

/**
 * "Partajează": hands the PDF to the phone's share sheet (Web Share API with files);
 * where sharing files is not supported, the PDF is downloaded instead.
 */
export function ShareMinutesButton({ meetingId, fileName, title }: { meetingId: string; fileName: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function share() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/pdf/proces-verbal/${meetingId}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title });
        } catch (err) {
          // Closing the share sheet is not an error.
          if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
        }
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.dataset.fallback = "download";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("PDF-ul nu a putut fi pregătit. Încercați din nou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={share} disabled={busy}>
        {busy ? "Se pregătește…" : "Partajează"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-warn">
          {error}
        </span>
      ) : null}
    </>
  );
}
