"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/shell/icons";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { DEFAULT_PRAYER_MESSAGE, PRAYER_MESSAGE_MAX, prayerMessage, prayerMessageError } from "@/lib/prayer";
import { savePrayerMessageAction } from "@/server/actions/prayer";

/** Setări → "Rugăciunea săptămânală": the message copied on /rugaciune, {familia} its only variable. */
export function PrayerMessageCard({ message, readOnly }: { message: string; readOnly: boolean }) {
  const { state, pending, onSubmit } = useActionForm(savePrayerMessageAction);
  const [draft, setDraft] = useState(message);
  // The same check as on the server, shown while typing; the preview uses an example family.
  const problem = prayerMessageError(draft);
  return (
    <form onSubmit={onSubmit} noValidate className="card mt-7" id="rugaciune">
      <h3>Rugăciunea săptămânală</h3>
      <p className="hint mb-3">
        Mesajul copiat pe pagina <Link href="/rugaciune">Rugăciune</Link> pentru grupul bisericii. Folosiți {"{familia}"} în locul numelui
        familiei; alte variabile nu sunt permise. Gol, se folosește textul implicit.
      </p>
      <FormMessage state={state} />
      <fieldset disabled={readOnly}>
        <div className="field">
          <label htmlFor="prayerMessage">Mesajul</label>
          <textarea
            id="prayerMessage"
            name="prayerMessage"
            rows={3}
            maxLength={PRAYER_MESSAGE_MAX}
            placeholder={DEFAULT_PRAYER_MESSAGE}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-describedby={state.errors?.prayerMessage ? "prayerMessage-err" : undefined}
          />
          {state.errors?.prayerMessage ? (
            <div className="field-error" id="prayerMessage-err" role="alert">
              {state.errors.prayerMessage}
            </div>
          ) : problem ? (
            <div className="hint">{problem}</div>
          ) : null}
        </div>
        <p className="hint mb-1">Previzualizare:</p>
        <p className="prayer-preview">{prayerMessage(draft, "Familia Popescu: Ion și Maria")}</p>
        {!readOnly ? (
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              <Icon name="bifa" className="size-[18px]" /> Salvează mesajul
            </button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
