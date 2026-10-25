"use client";

import { useActionState } from "react";
import { Icon } from "@/components/shell/icons";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { ROLE_NAME_MAX } from "@/lib/schemas/roles";
import { moveRoleAction, saveRoleAction, setRoleActiveAction } from "@/server/actions/roles";
import type { RoleRow } from "@/server/queries/roles";

const holdersText = (n: number) => (n === 0 ? "neatribuită" : n === 1 ? "1 persoană" : `${n} persoane`);

/** One role: rename, committee switch, move up/down, deactivate/reactivate. Read-only for non-admins. */
export function RoleRowControls({ role, first, last, canEdit }: { role: RoleRow; first: boolean; last: boolean; canEdit: boolean }) {
  const [saveState, save, saving] = useActionState(saveRoleAction.bind(null, role.id), initialFormState);
  const [moveState, move, moving] = useActionState(async (_: unknown, fd: FormData) => moveRoleAction(role.id, fd.get("dir") === "up" ? "up" : "down"), initialFormState);
  const [activeState, toggle, toggling] = useActionState(async () => setRoleActiveAction(role.id, !role.active), initialFormState);
  const error = [moveState, activeState].find((s) => s.message && !s.ok);

  if (!canEdit) {
    return (
      <div className="item !cursor-default" style={{ opacity: role.active ? 1 : 0.6 }}>
        <div className="body">
          <div className="t">
            {role.nume} {role.inCommittee ? <span className="tag">comitet</span> : null}{" "}
            {!role.active ? <span className="tag tag-warn">dezactivată</span> : null}
          </div>
          <div className="m">{holdersText(role.holders)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="item role-item !cursor-default" style={{ opacity: role.active ? 1 : 0.7 }}>
      <form action={move} className="role-move">
        <button type="submit" name="dir" value="up" className="btn btn-sm btn-ghost" disabled={first || moving} aria-label={`Mută „${role.nume}” mai sus`}>
          ↑
        </button>
        <button type="submit" name="dir" value="down" className="btn btn-sm btn-ghost" disabled={last || moving} aria-label={`Mută „${role.nume}” mai jos`}>
          ↓
        </button>
      </form>
      <div className="role-edit">
        <form action={save} id={`rol-form-${role.id}`} className="role-edit" noValidate>
          <TextField
            name="nume"
            label="Denumire"
            defaultValue={saveState.values?.nume ?? role.nume}
            error={saveState.errors?.nume}
            maxLength={ROLE_NAME_MAX}
            className="!mb-0"
            id={`rol-${role.id}`}
            hint={
              <>
                {holdersText(role.holders)}
                {!role.active ? " · dezactivată" : ""}
              </>
            }
          />
          <label className="switch-row !mb-0">
            <input type="checkbox" role="switch" name="inCommittee" defaultChecked={role.inCommittee} />
            <span>Face parte din comitet</span>
          </label>
        </form>
        <div className="flex gap-2 flex-wrap">
          <button type="submit" form={`rol-form-${role.id}`} className="btn btn-sm" disabled={saving}>
            {saving ? "Se salvează…" : "Salvează"}
          </button>
          <form action={toggle}>
            <button type="submit" className={`btn btn-sm ${role.active ? "btn-danger" : ""}`} disabled={toggling}>
              {role.active ? "Dezactivează" : "Reactivează"}
            </button>
          </form>
        </div>
        {saveState.message ? <FormMessage state={saveState} /> : null}
      </div>
      {error ? (
        <p className="field-error role-error" role="alert">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

export function NewRoleForm() {
  const [state, action, pending] = useActionState(saveRoleAction.bind(null, null), initialFormState);
  return (
    <form action={action} noValidate key={state.ok ? state.message : "form"}>
      <TextField name="nume" label="Denumire" placeholder="ex. Lider grup de rugăciune" defaultValue={state.ok ? "" : (state.values?.nume ?? "")} error={state.errors?.nume} maxLength={ROLE_NAME_MAX} />
      <label className="switch-row">
        <input type="checkbox" role="switch" name="inCommittee" defaultChecked={!state.ok && state.values?.inCommittee === "on"} />
        <span>Face parte din comitet</span>
      </label>
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        <Icon name="bifa" className="size-[18px]" />
        {pending ? "Se adaugă…" : "Adaugă funcția"}
      </button>
    </form>
  );
}
