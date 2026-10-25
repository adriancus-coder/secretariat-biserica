"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PersonChecklist, type ChecklistOption } from "@/components/person-checklist";
import { PersonPicker } from "@/components/person-picker";
import { Field, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { compareRo } from "@/lib/text";
import { saveGroupAction } from "@/server/actions/groups-notes";
import type { RoleChoiceGroup } from "@/server/queries/roles";

export function GroupForm({
  id,
  initial,
  manual,
  people,
  roles,
  holders,
  cancelHref,
}: {
  id: string | null;
  initial: { nume: string; functieId: string; functieLiderId: string; responsabilId: string; responsabil: string; descriere: string };
  /** The members added by hand (MANUAL). */
  manual: string[];
  people: ChecklistOption[];
  /** The roles to link the group to, by role group. */
  roles: RoleChoiceGroup[];
  /** Role id → its current holders: the automatic members of a linked group. */
  holders: Record<string, string[]>;
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(saveGroupAction.bind(null, id));
  const e = state.errors ?? {};
  const [functieId, setFunctieId] = useState(initial.functieId);
  const [functieLiderId, setFunctieLiderId] = useState(initial.functieLiderId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(manual));
  const [lead, setLead] = useState(initial.responsabilId);
  // An older free-text responsible (not linked to a person) is kept until a person is chosen or it is cleared.
  const [legacy, setLegacy] = useState(initial.responsabilId ? "" : initial.responsabil);
  const [addLead, setAddLead] = useState(true);

  const roleName = useMemo(() => new Map(roles.flatMap((g) => g.roles.map((r) => [r.id, r.nume] as const))), [roles]);
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  // The automatic members as they will be after saving (the holders of the chosen roles).
  const auto = useMemo(() => {
    const ids = new Set([...(holders[functieId] ?? []), ...(holders[functieLiderId] ?? [])]);
    return [...ids].filter((x) => nameOf.has(x)).sort((a, b) => compareRo(nameOf.get(a)!, nameOf.get(b)!));
  }, [holders, functieId, functieLiderId, nameOf]);
  const autoSet = useMemo(() => new Set(auto), [auto]);
  const manualOptions = useMemo(() => people.filter((p) => !autoSet.has(p.id)), [people, autoSet]);
  const linked = [functieId, functieLiderId].filter(Boolean).map((r) => roleName.get(r) ?? "").filter(Boolean);
  const memberIds = useMemo(() => [...auto, ...[...selected].filter((x) => !autoSet.has(x))], [auto, autoSet, selected]);
  // Suggestions for the responsible person, by the kind of group.
  const sections = useMemo(
    () => [
      ...(functieLiderId ? [{ title: "Au funcția de conducere", ids: holders[functieLiderId] ?? [] }] : []),
      ...(functieId ? [{ title: "Au slujirea grupului", ids: holders[functieId] ?? [] }] : []),
      { title: "Membri ai grupului", ids: memberIds },
    ],
    [functieId, functieLiderId, holders, memberIds],
  );
  const leadOutside = Boolean(lead) && !memberIds.includes(lead);

  return (
    <form onSubmit={onSubmit} noValidate>
      <TextField name="nume" label="Nume" placeholder="ex. Cor, Tineret, Comitet" defaultValue={initial.nume} error={e.nume} required />
      <div className="row2 stack-sm">
        <RoleSelect name="functieId" label="Slujirea grupului" roles={roles} value={functieId} onChange={setFunctieId} error={e.functieId} />
        <RoleSelect name="functieLiderId" label="Funcția de conducere" roles={roles} value={functieLiderId} onChange={setFunctieLiderId} error={e.functieLiderId} />
      </div>
      <Field label="Responsabil" error={e.responsabilId ?? e.responsabil}>
        <input type="hidden" name="responsabil" value={lead ? "" : legacy} />
        {legacy && !lead ? (
          <p className="hint !mt-0 mb-2">
            Acum: „{legacy}” (text, nelegat de registru).{" "}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLegacy("")}>
              Șterge textul
            </button>
          </p>
        ) : null}
        <PersonPicker name="responsabilId" label="Responsabil" people={people} sections={sections} value={lead} onChange={setLead} />
        {leadOutside ? (
          <label className="check mt-2 !border-0 min-h-[44px]">
            <input type="checkbox" name="adaugaResponsabil" checked={addLead} onChange={(ev) => setAddLead(ev.target.checked)} />
            Adaugă-l și în grup
          </label>
        ) : null}
      </Field>
      <TextAreaField name="descriere" label="Descriere" defaultValue={initial.descriere} error={e.descriere} className="[&_textarea]:!min-h-[70px]" />
      {linked.length ? (
        <Field label={`Din slujirea „${linked.join("” și „")}” (${auto.length})`}>
          <p className="hint !mt-0 mb-2">Se actualizează singur din funcțiile persoanelor. Pentru a scoate pe cineva, modificați funcțiile pe fișa persoanei.</p>
          {auto.length ? (
            <ul className="auto-members">
              {auto.map((pid) => (
                <li key={pid}>{nameOf.get(pid)}</li>
              ))}
            </ul>
          ) : (
            <p className="hint !mt-0">Nimeni nu are acum această funcție.</p>
          )}
        </Field>
      ) : null}
      <Field label={linked.length ? "Adăugați manual" : "Persoane"} error={e.membri}>
        {/* Only the manual members are sent; the automatic ones are added by the server. */}
        <PersonChecklist name="membri" options={manualOptions} selected={new Set([...selected].filter((x) => !autoSet.has(x)))} onSelectedChange={setSelected} />
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
function RoleSelect({
  name,
  label,
  roles,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  roles: RoleChoiceGroup[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={`f-${name}`} error={error}>
      <select id={`f-${name}`} name={name} value={value} onChange={(ev) => onChange(ev.target.value)} aria-invalid={error ? true : undefined}>
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
