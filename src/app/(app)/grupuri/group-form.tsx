"use client";

import Link from "next/link";
import { PersonChecklist, type ChecklistOption } from "@/components/person-checklist";
import { Field, TextAreaField, TextField } from "@/components/ui/fields";
import type { RoleChoiceGroup } from "@/server/queries/roles";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { saveGroupAction } from "@/server/actions/groups-notes";

export function GroupForm({
  id,
  initial,
  selected,
  people,
  roles,
  cancelHref,
}: {
  id: string | null;
  initial: { nume: string; functieId: string; functieLiderId: string; responsabil: string; descriere: string };
  selected: string[];
  people: ChecklistOption[];
  /** The roles to link the group to, by role group. */
  roles: RoleChoiceGroup[];
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(saveGroupAction.bind(null, id));
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate>
      <TextField name="nume" label="Nume" placeholder="ex. Cor, Tineret, Comitet" defaultValue={initial.nume} error={e.nume} required />
      <div className="row2 stack-sm">
        <RoleSelect name="functieId" label="Slujirea grupului" roles={roles} defaultValue={initial.functieId} error={e.functieId} />
        <RoleSelect name="functieLiderId" label="Funcția de conducere" roles={roles} defaultValue={initial.functieLiderId} error={e.functieLiderId} />
      </div>
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

/** A role from the nomenclature, grouped by role group ("Funcții", "Slujiri"…); optional. */
function RoleSelect({ name, label, roles, defaultValue, error }: { name: string; label: string; roles: RoleChoiceGroup[]; defaultValue: string; error?: string }) {
  return (
    <Field label={label} htmlFor={`f-${name}`} error={error}>
      <select id={`f-${name}`} name={name} defaultValue={defaultValue} aria-invalid={error ? true : undefined}>
        <option value="">— niciuna —</option>
        {roles.map((g) => (
          <optgroup key={g.id} label={g.nume}>
            {g.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nume}
                {r.active ? "" : " (dezactivată)"}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}
