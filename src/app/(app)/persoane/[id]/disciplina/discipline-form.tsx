"use client";

import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { todayIso } from "@/lib/dates";
import {
  DISCIPLINARY_FORM_LABEL,
  DISCIPLINARY_FORMS,
  DISCIPLINARY_FORUM_LABEL,
  DISCIPLINARY_FORUMS,
  DISCIPLINARY_STATE_LABEL,
  DISCIPLINARY_STATES,
} from "@/lib/labels";
import { saveDisciplineAction } from "@/server/actions/discipline";

const opts = <K extends string>(keys: readonly K[], labels: Record<K, string>) => keys.map((k) => ({ value: k, label: labels[k] }));

/** Adds or edits a disciplinary measure (administrators only). */
export function DisciplineForm({
  personId,
  measureId,
  initial,
  meetings,
}: {
  personId: string;
  measureId: string | null;
  initial: Record<string, string>;
  meetings: { value: string; label: string }[];
}) {
  const { state, pending, onSubmit } = useActionForm(saveDisciplineAction.bind(null, personId, measureId));
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="row2">
        <SelectField name="forma" label="Forma (Statut art. 27 alin. 3)" defaultValue={val("forma")} error={e.forma} emptyLabel="—" options={opts(DISCIPLINARY_FORMS, DISCIPLINARY_FORM_LABEL)} />
        <SelectField name="stare" label="Stare" defaultValue={val("stare") || "CERCETARE"} error={e.stare} options={opts(DISCIPLINARY_STATES, DISCIPLINARY_STATE_LABEL)} />
      </div>
      <div className="row2">
        <TextField name="dataInceput" label="Data" type="date" defaultValue={val("dataInceput") || todayIso()} error={e.dataInceput} />
        <TextField name="dataSfarsit" label="Data încheierii" type="date" defaultValue={val("dataSfarsit")} error={e.dataSfarsit} />
      </div>
      <div className="row2">
        <SelectField
          name="meetingId"
          label="Procesul-verbal"
          defaultValue={val("meetingId")}
          error={e.meetingId}
          emptyLabel="—"
          options={meetings}
          hint="Măsurile c)–e) se consemnează în procesul-verbal semnat de conducere (art. 27 alin. 10)."
        />
        <SelectField name="decisByForum" label="Forul care a decis" defaultValue={val("decisByForum") || "LOCAL"} error={e.decisByForum} options={opts(DISCIPLINARY_FORUMS, DISCIPLINARY_FORUM_LABEL)} />
      </div>
      <TextAreaField name="motiv" label="Motivul" defaultValue={val("motiv")} error={e.motiv} rows={3} />
      <FormMessage state={state} />
      <div className="actions">
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : measureId ? "Salvează măsura" : "Adaugă măsura"}
        </button>
      </div>
    </form>
  );
}
