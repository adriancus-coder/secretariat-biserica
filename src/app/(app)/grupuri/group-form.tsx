"use client";

import Link from "next/link";
import { PersonChecklist, type ChecklistOption } from "@/components/person-checklist";
import { Field, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { saveGroupAction } from "@/server/actions/groups-notes";

export function GroupForm({
  id,
  initial,
  selected,
  people,
  cancelHref,
}: {
  id: string | null;
  initial: { nume: string; responsabil: string; descriere: string };
  selected: string[];
  people: ChecklistOption[];
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(saveGroupAction.bind(null, id));
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate>
      <TextField name="nume" label="Nume" placeholder="ex. Cor, Tineret, Comitet" defaultValue={initial.nume} error={e.nume} required />
      <TextField name="responsabil" label="Responsabil" defaultValue={initial.responsabil} error={e.responsabil} />
      <TextAreaField name="descriere" label="Descriere" defaultValue={initial.descriere} error={e.descriere} className="[&_textarea]:!min-h-[70px]" />
      <Field label="Persoane" error={e.membri}>
        <PersonChecklist name="membri" options={people} defaultSelected={selected} />
      </Field>
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
