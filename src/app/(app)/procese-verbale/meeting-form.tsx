"use client";

import Link from "next/link";
import { PersonChecklist, type ChecklistOption } from "@/components/person-checklist";
import { Field, nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { saveMeetingAction } from "@/server/actions/meetings";

export function MeetingForm({
  id,
  initial,
  selected,
  people,
  tipuri,
  cancelHref,
}: {
  id: string | null;
  initial: Record<string, string>;
  selected: string[];
  people: ChecklistOption[];
  tipuri: string[];
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(saveMeetingAction.bind(null, id));
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";
  const inRegister = people.filter((p) => !p.note).length;

  return (
    <form onSubmit={onSubmit} noValidate>
      <TextField name="titlu" label="Titlu" placeholder="ex. Ședință de comitet — planificare toamnă" defaultValue={val("titlu")} error={e.titlu} />
      <div className="row2">
        <SelectField name="tip" label="Tip" defaultValue={val("tip")} error={e.tip} options={nomenOptions(tipuri, val("tip"))} />
        <TextField name="data" label="Data" type="date" defaultValue={val("data")} error={e.data} required />
      </div>
      <div className="row2">
        <TextField name="ora" label="Ora" type="time" defaultValue={val("ora")} error={e.ora} />
        <TextField name="loc" label="Locul" defaultValue={val("loc")} error={e.loc} />
      </div>
      <TextField name="presedinte" label="Președinte de ședință" defaultValue={val("presedinte")} error={e.presedinte} />
      <Field label={`Prezenți (${inRegister} în registru)`} error={e.prezenti}>
        <PersonChecklist name="prezenti" options={people} defaultSelected={selected} />
      </Field>
      <TextField name="invitati" label="Invitați / alte persoane" defaultValue={val("invitati")} error={e.invitati} />
      <TextAreaField name="ordine" label="Ordinea de zi" placeholder={"1. …\n2. …"} defaultValue={val("ordine")} error={e.ordine} />
      <TextAreaField name="discutii" label="Discuții" defaultValue={val("discutii")} error={e.discutii} />
      <TextAreaField name="hotarari" label="Hotărâri" placeholder="Se hotărăște …" defaultValue={val("hotarari")} error={e.hotarari} />
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
