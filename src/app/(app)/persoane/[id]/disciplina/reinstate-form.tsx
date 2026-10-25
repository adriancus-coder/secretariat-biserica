"use client";

import { useActionState } from "react";
import { SelectField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { reinstateAction } from "@/server/actions/discipline";

/** "Repunere în drepturi / reprimire" (Statut art. 271): the written request and the committee minutes. */
export function ReinstateForm({
  personId,
  measureId,
  exclusion,
  meetings,
}: {
  personId: string;
  measureId: string;
  exclusion: boolean;
  meetings: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(reinstateAction.bind(null, personId, measureId), initialFormState);
  const v = state.values;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer min-h-11 flex items-center font-medium">{exclusion ? "Reprimire (art. 271)" : "Repunere în drepturi (art. 271)"}</summary>
      <form action={action} className="mt-2">
        <div className="row2">
          <TextField name="cerereLa" label="Data cererii scrise" type="date" defaultValue={v?.cerereLa ?? ""} error={state.errors?.cerereLa} />
          <SelectField
            name="meetingId"
            label="Procesul-verbal al comitetului"
            defaultValue={v?.meetingId ?? ""}
            error={state.errors?.meetingId}
            emptyLabel="—"
            options={meetings}
          />
        </div>
        {exclusion ? (
          <p className="hint !mt-0 mb-2">Persoana redevine membru, cu modul de intrare „Reabilitare spirituală” la data procesului-verbal.</p>
        ) : null}
        <FormMessage state={state} />
        <div className="actions">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Se salvează…" : exclusion ? "Reprimește" : "Repune în drepturi"}
          </button>
        </div>
      </form>
    </details>
  );
}
