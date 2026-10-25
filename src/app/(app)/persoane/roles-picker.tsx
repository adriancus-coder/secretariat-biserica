"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/icons";

export interface RoleChoice {
  id: string;
  nume: string;
  inCommittee: boolean;
  active: boolean;
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
 * The person's church roles: one selectable card per role, with an optional "din" date once chosen.
 * The selection travels as JSON in the hidden field `functii` (see personRolesSchema).
 */
export function RolesPicker({ roles, initial, error }: { roles: RoleChoice[]; initial?: string; error?: string }) {
  const [picked, setPicked] = useState<Picked[]>(() => parse(initial));
  const byId = new Map(picked.map((p) => [p.id, p]));
  const toggle = (id: string, on: boolean) => setPicked((list) => (on ? [...list, { id, din: "" }] : list.filter((p) => p.id !== id)));
  const setDate = (id: string, din: string) => setPicked((list) => list.map((p) => (p.id === id ? { ...p, din } : p)));

  return (
    <fieldset className="card">
      <h3>Funcții în biserică</h3>
      <input type="hidden" name="functii" value={JSON.stringify(picked)} />
      {roles.length ? (
        <div className="roles-grid">
          {roles.map((r) => {
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
                  {r.inCommittee ? <span className="tag">comitet</span> : null}
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
        <p className="hint">Nu există funcții definite. Administratorul le poate adăuga din Setări → Funcții în biserică.</p>
      )}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
