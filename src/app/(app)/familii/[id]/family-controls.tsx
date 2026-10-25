"use client";

import { useActionState } from "react";
import { Icon } from "@/components/shell/icons";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { FAMILY_NAME_MAX, NEW_FAMILY } from "@/lib/families";
import { initialFormState } from "@/lib/form-state";
import { moveToFamilyAction, saveFamilyAction } from "@/server/actions/families";

/** Name, head (one of the members), address and notes of a family. */
export function FamilyForm({
  id,
  initial,
  members,
}: {
  id: string;
  initial: { nume: string; adresa: string; note: string; headId: string };
  members: { id: string; name: string }[];
}) {
  const { state, pending, onSubmit } = useActionForm(saveFamilyAction.bind(null, id));
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate>
      <TextField name="nume" label="Numele familiei" defaultValue={v.nume ?? ""} error={e.nume} maxLength={FAMILY_NAME_MAX} required />
      <SelectField
        name="headId"
        label="Capul familiei"
        defaultValue={v.headId ?? ""}
        error={e.headId}
        options={members.map((m) => ({ value: m.id, label: m.name }))}
        hint="Numai capul familiei poate fi schimbat de aici; ceilalți membri se mută cu „Mută”."
      />
      <TextField name="adresa" label="Adresă" defaultValue={v.adresa ?? ""} error={e.adresa} />
      <TextAreaField name="note" label="Note" defaultValue={v.note ?? ""} error={e.note} />
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        <Icon name="bifa" className="size-[18px]" />
        {pending ? "Se salvează…" : "Salvează familia"}
      </button>
    </form>
  );
}

/** "Mută persoana în altă familie". */
export function MoveMemberForm({ personId, name, families }: { personId: string; name: string; families: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(moveToFamilyAction.bind(null, personId), initialFormState);
  return (
    <form action={action} className="move-member">
      <select name="tinta" aria-label={`Mută ${name} în familia`} defaultValue="">
        <option value="" disabled>
          Mută în altă familie…
        </option>
        <option value={NEW_FAMILY}>Familie nouă (cu {name} cap de familie)</option>
        {families.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-sm" disabled={pending}>
        {pending ? "Se mută…" : "Mută"}
      </button>
      {state.message && !state.ok ? (
        <p className="field-error w-full" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
