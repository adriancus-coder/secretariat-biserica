"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/shell/icons";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { FAMILY_NAME_MAX, NEW_FAMILY } from "@/lib/families";
import { initialFormState } from "@/lib/form-state";
import { normalizeSearch } from "@/lib/text";
import { addFamilyMembersAction, moveToFamilyAction, saveFamilyAction } from "@/server/actions/families";

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
        emptyLabel={initial.headId ? undefined : "— fără cap (doar copii) —"}
        error={e.headId}
        options={members.map((m) => ({ value: m.id, label: m.name }))}
        hint="Doar adulții (nu copiii, nu cei sub 18 ani) pot fi cap de familie. Ceilalți membri se mută cu „Mută”."
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

/**
 * "Adaugă membri": persons without a family, searchable, several at once; each one chosen gets a
 * kinship. The choice travels as JSON in the hidden field `membri`.
 */
export function AddMembersForm({
  familyId,
  candidates,
  rudenie,
}: {
  familyId: string;
  candidates: { id: string; name: string; note: string }[];
  rudenie: string[];
}) {
  const { state, pending, onSubmit } = useActionForm(addFamilyMembersAction.bind(null, familyId));
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<{ id: string; rudenie: string }[]>([]);
  const key = normalizeSearch(q);
  const shown = candidates.filter((c) => !key || normalizeSearch(c.name).includes(key));
  const isChosen = (id: string) => chosen.some((c) => c.id === id);
  const toggle = (id: string, on: boolean) => setChosen((list) => (on ? [...list, { id, rudenie: "" }] : list.filter((c) => c.id !== id)));
  const setRudenie = (id: string, r: string) => setChosen((list) => list.map((c) => (c.id === id ? { ...c, rudenie: r } : c)));

  if (!candidates.length) return <p className="hint">Toate persoanele din evidență fac deja parte dintr-o familie.</p>;
  return (
    <form onSubmit={onSubmit} noValidate>
      <input type="hidden" name="membri" value={JSON.stringify(chosen)} />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Caută persoana (fără familie)"
        aria-label="Caută persoana"
        className="w-full mb-2"
      />
      <div className="checklist add-members">
        {shown.map((c) => (
          <div key={c.id} className="add-member-row">
            <label className="choice">
              <input type="checkbox" checked={isChosen(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
              <span className="tick" aria-hidden="true">
                <Icon name="bifa" className="size-[14px]" />
              </span>
              <span className="min-w-0 flex-1">
                {c.name}
                <span className="block text-xs font-normal text-ink-3">{c.note}</span>
              </span>
            </label>
            {isChosen(c.id) ? (
              <select
                aria-label={`Gradul de rudenie: ${c.name}`}
                value={chosen.find((x) => x.id === c.id)?.rudenie ?? ""}
                onChange={(e) => setRudenie(c.id, e.target.value)}
              >
                <option value="">Rudenie —</option>
                {rudenie.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ))}
        {!shown.length ? <p className="hint p-2">Niciun rezultat.</p> : null}
      </div>
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary mt-2" disabled={pending || !chosen.length}>
        <Icon name="familii" className="size-[18px]" />
        {pending ? "Se adaugă…" : chosen.length > 1 ? `Adaugă ${chosen.length} persoane` : "Adaugă în familie"}
      </button>
    </form>
  );
}
