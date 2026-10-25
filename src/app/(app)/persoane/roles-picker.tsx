"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/shell/icons";
import { ROLE_NAME_MAX } from "@/lib/schemas/roles";
import { addRoleInlineAction } from "@/server/actions/roles";

export interface RoleChoiceGroup {
  id: string;
  nume: string;
  roles: { id: string; nume: string; active: boolean }[];
}

interface Picked {
  id: string;
  din: string;
}

function parse(json: string | undefined): Picked[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x?.id === "string").map((x) => ({ id: x.id, din: typeof x.din === "string" ? x.din : "" })) : [];
  } catch {
    return [];
  }
}

/**
 * "Membru în comitet" and one block per role group (Funcții, Slujiri, …): selectable cards with an
 * optional "din" date once chosen, and "+ Adaugă" to create an entry inline. The selection travels as
 * JSON in the hidden field `functii` (see personRolesSchema); the committee flag as `inComitet`.
 */
export function RolesPicker({
  groups: initialGroups,
  initial,
  inComitet,
  error,
}: {
  groups: RoleChoiceGroup[];
  initial?: string;
  inComitet: boolean;
  error?: string;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [picked, setPicked] = useState<Picked[]>(() => parse(initial));
  const byId = new Map(picked.map((p) => [p.id, p]));
  const toggle = (id: string, on: boolean) => setPicked((list) => (on ? [...list, { id, din: "" }] : list.filter((p) => p.id !== id)));
  const setDate = (id: string, din: string) => setPicked((list) => list.map((p) => (p.id === id ? { ...p, din } : p)));
  function added(role: { id: string; nume: string; groupId: string }) {
    setGroups((gs) =>
      gs.map((g) => (g.id === role.groupId && !g.roles.some((r) => r.id === role.id) ? { ...g, roles: [...g.roles, { id: role.id, nume: role.nume, active: true }] } : g)),
    );
    setPicked((list) => (list.some((p) => p.id === role.id) ? list : [...list, { id: role.id, din: "" }]));
  }

  return (
    <fieldset className="card">
      <h3>Comitet, funcții și slujiri</h3>
      <input type="hidden" name="functii" value={JSON.stringify(picked)} />
      <label className="choice mb-4">
        <input type="checkbox" name="inComitet" defaultChecked={inComitet} />
        <span className="tick" aria-hidden="true">
          <Icon name="bifa" className="size-[14px]" />
        </span>
        Membru în comitet
      </label>
      {groups.map((g) => (
        <div key={g.id} className="role-block" role="group" aria-labelledby={`grup-${g.id}`}>
          <h4 id={`grup-${g.id}`}>{g.nume}</h4>
          {g.roles.length ? (
            <div className="roles-grid">
              {g.roles.map((r) => {
                const p = byId.get(r.id);
                return (
                  <div key={r.id}>
                    <label className="choice">
                      <input type="checkbox" checked={Boolean(p)} onChange={(e) => toggle(r.id, e.target.checked)} />
                      <span className="tick" aria-hidden="true">
                        <Icon name="bifa" className="size-[14px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {r.nume}
                        {!r.active ? <span className="hint inline"> (dezactivată)</span> : null}
                      </span>
                    </label>
                    {p ? (
                      <label className="role-since">
                        <span>din</span>
                        <input type="date" value={p.din} onChange={(e) => setDate(r.id, e.target.value)} aria-label={`${r.nume}: din data`} />
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="hint">Nicio intrare încă.</p>
          )}
          <InlineAdd group={g} onAdded={added} />
        </div>
      ))}
      {!groups.length ? <p className="hint">Nu există funcții sau slujiri. Administratorul le poate adăuga din Setări.</p> : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** "+ Adaugă": a new entry in the group, created on the server and selected; an existing name is selected instead. */
function InlineAdd({ group, onAdded }: { group: RoleChoiceGroup; onAdded: (r: { id: string; nume: string; groupId: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" className="btn btn-sm mt-2" onClick={() => setOpen(true)}>
        + Adaugă în „{group.nume}”
      </button>
    );
  }
  const submit = () =>
    start(async () => {
      const r = await addRoleInlineAction(group.id, name);
      if (r.role) {
        onAdded(r.role);
        setName("");
        setMessage("");
        setOpen(false);
      } else setMessage(r.errors?.nume ?? r.message ?? "Nu s-a putut adăuga.");
    });
  return (
    <div className="role-add">
      <input
        type="text"
        value={name}
        maxLength={ROLE_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // Enter adds the entry instead of submitting the person form.
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        aria-label={`Denumire nouă în „${group.nume}”`}
        placeholder="Denumire"
        autoFocus
      />
      <button type="button" className="btn btn-sm" disabled={pending || !name.trim()} onClick={submit}>
        {pending ? "Se adaugă…" : "Adaugă"}
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
        Renunță
      </button>
      {message ? (
        <p className="field-error w-full" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
