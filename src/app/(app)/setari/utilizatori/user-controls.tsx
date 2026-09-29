"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/shell/icons";
import { SelectField, TextField } from "@/components/ui/fields";
import { initialFormState } from "@/lib/form-state";
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLES, type RoleKey } from "@/lib/labels";
import {
  changeRoleAction,
  inviteUserAction,
  passwordResetLinkAction,
  revokeInvitationAction,
  setUserActiveAction,
  type LinkState,
} from "@/server/actions/users";

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2 items-center mt-2 flex-wrap">
      <input readOnly value={link} className="flex-1 min-w-0 font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copiat" : "Copiază"}
      </button>
    </div>
  );
}

function Message({ state }: { state: LinkState }) {
  if (!state.message) return null;
  return (
    <>
      {state.warning ? (
        <div className="alert !mb-0 mt-2" role="alert">
          {state.warning}
        </div>
      ) : null}
      <div className={`alert ${state.ok ? "alert-ok" : ""} !mb-0 mt-2`} role={state.ok ? "status" : "alert"}>
        {state.message}
        {state.link ? <CopyLink link={state.link} /> : null}
      </div>
    </>
  );
}

export function InviteForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, action, pending] = useActionState(inviteUserAction, initialFormState as LinkState);
  const [role, setRole] = useState<RoleKey>("SECRETAR");
  return (
    <form action={action} noValidate>
      <div className="row2 stack-sm">
        <TextField name="email" label="E-mail" type="email" autoComplete="off" error={state.errors?.email} defaultValue={state.ok ? "" : state.values?.email} />
        <SelectField
          name="role"
          label="Rol"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleKey)}
          options={roleOptions}
          hint={ROLE_DESCRIPTION[role]}
          error={state.errors?.role}
        />
      </div>
      <button type="submit" className="btn btn-primary min-h-11" disabled={pending}>
        <Icon name="email" className="size-[18px]" />
        {emailEnabled ? (pending ? "Se trimite…" : "Trimite invitația") : pending ? "Se creează…" : "Creează invitația"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function RoleSelect({ userId, role, disabled }: { userId: string; role: RoleKey; disabled?: boolean }) {
  const [state, action, pending] = useActionState(changeRoleAction.bind(null, userId), initialFormState);
  return (
    <form action={action} className="flex flex-col">
      <select
        name="role"
        defaultValue={role}
        disabled={disabled || pending}
        aria-label="Rol"
        className="!w-auto !py-1.5 text-[14px]"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {roleOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {state.message && !state.ok ? <span className="field-error">{state.message}</span> : null}
    </form>
  );
}

export function ActiveToggle({ userId, active, disabled }: { userId: string; active: boolean; disabled?: boolean }) {
  const [state, action, pending] = useActionState(async () => setUserActiveAction(userId, !active), initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (active && !window.confirm("Dezactivați contul? Utilizatorul va fi deconectat imediat.")) e.preventDefault();
      }}
    >
      <button type="submit" className={`btn btn-sm ${active ? "btn-danger" : ""}`} disabled={disabled || pending}>
        {active ? "Dezactivează" : "Reactivează"}
      </button>
      {state.message && !state.ok ? <span className="field-error block">{state.message}</span> : null}
    </form>
  );
}

export function ResetLinkButton({ userId, emailEnabled }: { userId: string; emailEnabled: boolean }) {
  const [state, action, pending] = useActionState(async () => passwordResetLinkAction(userId), initialFormState as LinkState);
  return (
    <form action={action}>
      <button type="submit" className="btn btn-sm" disabled={pending}>
        {emailEnabled ? "Trimite link de resetare" : "Link resetare parolă"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function RevokeInvitation({ id }: { id: string }) {
  const [state, action, pending] = useActionState(async () => revokeInvitationAction(id), initialFormState);
  return (
    <form action={action}>
      <button type="submit" className="btn btn-sm btn-ghost" disabled={pending}>
        Anulează
      </button>
      {state.message && !state.ok ? <span className="field-error block">{state.message}</span> : null}
    </form>
  );
}
