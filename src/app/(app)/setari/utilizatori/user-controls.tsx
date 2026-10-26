"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icons";
import { SelectField, TextField } from "@/components/ui/fields";
import { initialFormState, type FormState } from "@/lib/form-state";
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLES, type RoleKey } from "@/lib/labels";
import {
  changeRoleAction,
  inviteUserAction,
  passwordResetLinkAction,
  revokeInvitationAction,
  setUserActiveAction,
  endUserSessionsAction,
  setPastorAction,
  setDisciplineAccessAction,
  type LinkState,
} from "@/server/actions/users";

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2 items-center mt-2 flex-wrap">
      <input readOnly value={link} className="flex-1 min-w-0 font-mono text-[0.8125rem]" onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
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
        className="!w-auto min-h-10 !py-1.5 text-[0.875rem]"
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

export function EndSessionsButton({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState(async () => endUserSessionsAction(userId), initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Deconectați ${name} de pe toate dispozitivele?`)) e.preventDefault();
      }}
    >
      <button type="submit" className="btn btn-sm" disabled={pending}>
        Deconectează peste tot
      </button>
      {state.message ? <span className={`block ${state.ok ? "hint" : "field-error"}`}>{state.message}</span> : null}
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

/** "Pastor al bisericii" with its optional label; saved on change (administrators). */
export function PastorControl({ userId, isPastor, titlu, disabled }: { userId: string; isPastor: boolean; titlu: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(setPastorAction.bind(null, userId), initialFormState);
  const [on, setOn] = useState(isPastor);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {/* From state: the form's automatic reset after each submit must not change what is sent. */}
      <input type="hidden" name="isPastor" value={on ? "on" : ""} />
      <label className="check !border-0 !py-0 min-h-11">
        <input
          type="checkbox"
          checked={on}
          disabled={disabled || pending}
          onChange={(e) => {
            setOn(e.target.checked);
            const form = e.currentTarget.form;
            queueMicrotask(() => form?.requestSubmit());
          }}
        />
        Pastor al bisericii
      </label>
      {on ? (
        <select
          name="pastorTitlu"
          defaultValue={titlu}
          disabled={disabled || pending}
          aria-label="Titlul pastorului"
          className="!w-auto min-h-10 !py-1.5 text-[0.875rem]"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">— fără titlu —</option>
          <option value="pastor coordonator">pastor coordonator</option>
          <option value="pastor asistent">pastor asistent</option>
        </select>
      ) : (
        <input type="hidden" name="pastorTitlu" value="" />
      )}
      {state.message && !state.ok ? <span className="field-error">{state.message}</span> : null}
    </form>
  );
}

/** "Acces la măsurile disciplinare": on / off for one Administrator or Secretar (a pastor decides; step-up on the server). */
export function DisciplineAccessToggle({ userId, name, on }: { userId: string; name: string; on: boolean }) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="check !border-0 !py-0 min-h-11">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          aria-label={`Acces la măsurile disciplinare pentru ${name}`}
          onChange={(e) => {
            const value = e.target.checked;
            start(async () => {
              const r = await setDisciplineAccessAction(userId, value);
              setState(r);
              if (r.ok) router.refresh();
            });
          }}
        />
        Acces
      </label>
      {state.message ? <span className={state.ok ? "hint !mt-0" : "field-error"} role="status">{state.message}</span> : null}
    </span>
  );
}
