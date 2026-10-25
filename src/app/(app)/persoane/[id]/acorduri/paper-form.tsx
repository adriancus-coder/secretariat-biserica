"use client";

import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { todayIso } from "@/lib/dates";
import { CONSENT_QUESTION, OPTIONAL_CONSENTS } from "@/lib/labels";
import { recordPaperConsentAction } from "@/server/actions/consents";

/** "Înregistrează acord pe hârtie": the date, the notice confirmation and the four answers (each optional). */
export function PaperConsentForm({ personId, parents }: { personId: string; parents: { id: string; name: string }[] }) {
  const { state, pending, onSubmit } = useActionForm(recordPaperConsentAction.bind(null, personId));
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="row2 stack-sm">
        <TextField name="data" label="Data formularului" type="date" defaultValue={todayIso()} error={e.data} />
        {parents.length ? (
          <div className="field">
            <label htmlFor="datDe">Semnat de (părintele)</label>
            <select id="datDe" name="datDe" defaultValue="">
              <option value="">—</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div />
        )}
      </div>
      <label className="check">
        <input type="checkbox" name="INFO_NOTE" /> A citit nota de informare
      </label>
      {OPTIONAL_CONSENTS.map((k) => (
        <fieldset key={k} className="yes-no">
          <legend>{CONSENT_QUESTION[k]}</legend>
          <div className="yes-no-options">
            {(["da", "nu", ""] as const).map((v) => (
              <label key={v || "none"} className="yes-no-option">
                <input type="radio" name={k} value={v} defaultChecked={v === ""} />
                {v === "da" ? "Da" : v === "nu" ? "Nu" : "Fără răspuns"}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <FormMessage state={state} />
      <div className="actions">
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : "Înregistrează acordul"}
        </button>
      </div>
    </form>
  );
}
