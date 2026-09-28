"use client";

import Link from "next/link";
import { nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { saveNoteAction } from "@/server/actions/groups-notes";

export function NoteForm({
  id,
  initial,
  people,
  families,
  tipuri,
  backToPerson,
  cancelHref,
}: {
  id: string | null;
  initial: { data: string; tip: string; personId: string; familie: string; text: string };
  people: { id: string; name: string; exited: boolean }[];
  families: string[];
  tipuri: string[];
  backToPerson: boolean;
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(saveNoteAction.bind(null, id));
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate>
      {backToPerson ? <input type="hidden" name="inapoi" value="persoana" /> : null}
      <div className="row2">
        <TextField name="data" label="Data" type="date" defaultValue={initial.data} error={e.data} required />
        <SelectField name="tip" label="Tip" defaultValue={initial.tip} error={e.tip} options={nomenOptions(tipuri, initial.tip)} />
      </div>
      <div className="row2 stack-sm">
        <SelectField
          name="personId"
          label="Persoana"
          defaultValue={initial.personId}
          error={e.personId}
          emptyLabel="—"
          options={people.map((p) => ({ value: p.id, label: p.exited ? `${p.name} (ieșit)` : p.name }))}
        />
        <TextField name="familie" label="sau familia" list="familii-mentiuni" defaultValue={initial.familie} error={e.familie} autoComplete="off" />
      </div>
      <datalist id="familii-mentiuni">
        {families.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <TextAreaField name="text" label="Mențiune" defaultValue={initial.text} error={e.text} required />
      <FormMessage state={state} />
      <div className="actions">
        <Link href={cancelHref} className="btn btn-ghost">
          Renunță
        </Link>
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : "Salvează"}
        </button>
      </div>
    </form>
  );
}
