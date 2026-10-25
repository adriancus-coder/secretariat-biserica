"use client";

import { useActionState } from "react";
import { Icon } from "@/components/shell/icons";
import { TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { ROLE_NAME_MAX } from "@/lib/schemas/roles";
import {
  moveRoleAction,
  moveRoleGroupAction,
  saveRoleAction,
  saveRoleGroupAction,
  setRoleActiveAction,
  setRoleGroupActiveAction,
} from "@/server/actions/roles";
import type { RoleGroupRow, RoleRow } from "@/server/queries/roles";

const holdersText = (n: number) => (n === 0 ? "neatribuită" : n === 1 ? "1 persoană" : `${n} persoane`);

/** The ↑ ↓ buttons of a list row. */
function MoveButtons({ label, first, last, onMove }: { label: string; first: boolean; last: boolean; onMove: (fd: FormData) => void }) {
  return (
    <form action={onMove} className="role-move">
      <button type="submit" name="dir" value="up" className="btn btn-sm btn-ghost" disabled={first} aria-label={`Mută „${label}” mai sus`}>
        ↑
      </button>
      <button type="submit" name="dir" value="down" className="btn btn-sm btn-ghost" disabled={last} aria-label={`Mută „${label}” mai jos`}>
        ↓
      </button>
    </form>
  );
}

/** One group: its header (rename, move, deactivate), its entries and "Adaugă în …". */
export function RoleGroupCard({ group, first, last, canEdit }: { group: RoleGroupRow; first: boolean; last: boolean; canEdit: boolean }) {
  const [saveState, save, saving] = useActionState(saveRoleGroupAction.bind(null, group.id), initialFormState);
  const [moveState, move] = useActionState(async (_: unknown, fd: FormData) => moveRoleGroupAction(group.id, fd.get("dir") === "up" ? "up" : "down"), initialFormState);
  const [activeState, toggle, toggling] = useActionState(async () => setRoleGroupActiveAction(group.id, !group.active), initialFormState);
  const error = [moveState, activeState].find((s) => s.message && !s.ok);
  const activeRoles = group.roles.filter((r) => r.active).length;

  return (
    <section className="card" style={{ opacity: group.active ? 1 : 0.75 }} aria-label={group.nume}>
      {canEdit ? (
        <div className="role-item">
          <MoveButtons label={group.nume} first={first} last={last} onMove={move} />
          <div className="role-edit">
            <form action={save} id={`grup-form-${group.id}`} noValidate>
              <TextField
                name="nume"
                label="Grup"
                id={`grup-${group.id}`}
                defaultValue={saveState.values?.nume ?? group.nume}
                error={saveState.errors?.nume}
                maxLength={ROLE_NAME_MAX}
                className="!mb-0"
                hint={`${activeRoles} active${group.active ? "" : " · grup dezactivat"}`}
              />
            </form>
            <div className="flex gap-2 flex-wrap">
              <button type="submit" form={`grup-form-${group.id}`} className="btn btn-sm" disabled={saving}>
                {saving ? "Se salvează…" : "Redenumește"}
              </button>
              <form action={toggle}>
                <button type="submit" className={`btn btn-sm ${group.active ? "btn-danger" : ""}`} disabled={toggling}>
                  {group.active ? "Dezactivează grupul" : "Reactivează grupul"}
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
      ) : (
        <h3>
          {group.nume} {!group.active ? <span className="tag tag-warn">dezactivat</span> : null}
        </h3>
      )}

      <div className="list mt-3">
        {group.roles.map((r, i) => (
          <RoleRowControls key={r.id} role={r} first={i === 0} last={i === group.roles.length - 1} canEdit={canEdit} />
        ))}
        {!group.roles.length ? <p className="hint">Nicio intrare.</p> : null}
      </div>
      {canEdit && group.active ? <NewRoleForm groupId={group.id} groupName={group.nume} /> : null}
    </section>
  );
}

/** One entry: rename, move up/down, deactivate/reactivate. Read-only for non-admins. */
function RoleRowControls({ role, first, last, canEdit }: { role: RoleRow; first: boolean; last: boolean; canEdit: boolean }) {
  const [saveState, save, saving] = useActionState(saveRoleAction.bind(null, role.id, null), initialFormState);
  const [moveState, move] = useActionState(async (_: unknown, fd: FormData) => moveRoleAction(role.id, fd.get("dir") === "up" ? "up" : "down"), initialFormState);
  const [activeState, toggle, toggling] = useActionState(async () => setRoleActiveAction(role.id, !role.active), initialFormState);
  const error = [moveState, activeState].find((s) => s.message && !s.ok);

  if (!canEdit) {
    return (
      <div className="item !cursor-default" style={{ opacity: role.active ? 1 : 0.6 }}>
        <div className="body">
          <div className="t">
            {role.nume} {!role.active ? <span className="tag tag-warn">dezactivată</span> : null}
          </div>
          <div className="m">{holdersText(role.holders)}</div>
          {role.groups.length ? <div className="m">Folosită de grupurile: {role.groups.join(", ")}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="item role-item !cursor-default" style={{ opacity: role.active ? 1 : 0.7 }}>
      <MoveButtons label={role.nume} first={first} last={last} onMove={move} />
      <div className="role-edit">
        <form action={save} id={`rol-form-${role.id}`} noValidate>
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
                {role.groups.length ? <span className="block">Folosită de grupurile: {role.groups.join(", ")}</span> : null}
              </>
            }
          />
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

function NewRoleForm({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [state, action, pending] = useActionState(saveRoleAction.bind(null, null, groupId), initialFormState);
  return (
    <form action={action} noValidate key={state.ok ? state.message : "form"} className="mt-3 flex flex-wrap items-end gap-2">
      <TextField
        name="nume"
        label={`Adaugă în „${groupName}”`}
        id={`nou-${groupId}`}
        placeholder="ex. Lider grup de rugăciune"
        defaultValue={state.ok ? "" : (state.values?.nume ?? "")}
        error={state.errors?.nume}
        maxLength={ROLE_NAME_MAX}
        className="!mb-0 flex-1 min-w-[12rem]"
      />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Se adaugă…" : "+ Adaugă"}
      </button>
      {state.message && !state.errors ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function NewGroupForm() {
  const [state, action, pending] = useActionState(saveRoleGroupAction.bind(null, null), initialFormState);
  return (
    <form action={action} noValidate key={state.ok ? state.message : "form"}>
      <TextField
        name="nume"
        label="Denumirea grupului"
        placeholder="ex. Echipa media"
        defaultValue={state.ok ? "" : (state.values?.nume ?? "")}
        error={state.errors?.nume}
        maxLength={ROLE_NAME_MAX}
      />
      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        <Icon name="bifa" className="size-[18px]" />
        {pending ? "Se adaugă…" : "Adaugă grupul"}
      </button>
    </form>
  );
}
