"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SelectField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { extendCommitteeMandateAction, saveCommitteeMandateAction } from "@/server/actions/committee";

/** Setări: the committee's mandate (Statut art. 45): 5 years from the election, extended once by 5. */
export function CommitteeCard({
  alesLa,
  sedinta,
  prelungit,
  end,
  meetings,
  members,
  notice,
  readOnly,
}: {
  alesLa: string | null;
  /** The election's minutes, when chosen: id and label. */
  sedinta: { id: string; label: string } | null;
  prelungit: boolean;
  /** "15 martie 2027", or null without an election date. */
  end: string | null;
  meetings: { value: string; label: string }[];
  /** The current committee ("Membru în comitet" on the person's form). */
  members: { id: string; name: string }[];
  /** The notice from 6 months before the end (or after it), else null. */
  notice: string | null;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(saveCommitteeMandateAction, initialFormState);
  const [extState, extend, extending] = useActionState(extendCommitteeMandateAction, initialFormState);
  const v = state.values;
  return (
    <div className="card mt-7">
      <h3 id="comitet">Comitetul bisericii</h3>
      <p className="hint mb-3">
        Statut art. 45: comitetul este ales pentru 5 ani; mandatul poate fi prelungit o singură dată cu 5 ani. Pe Acasă apare o atenționare cu 6 luni
        înainte de expirare.
      </p>
      {notice ? (
        <div className="alert mb-3" role="status">
          {notice}
        </div>
      ) : null}
      <dl className="detail mb-3">
        <dt>Ales la</dt>
        <dd>{alesLa ? alesLa.split("-").reverse().join(".") : "—"}</dd>
        <dt>Procesul-verbal al alegerii</dt>
        <dd>{sedinta ? <Link href={`/procese-verbale/${sedinta.id}`}>{sedinta.label}</Link> : "—"}</dd>
        <dt>Expiră la</dt>
        <dd>
          {end ?? "—"}
          {prelungit ? <span className="tag ml-1.5">prelungit o dată</span> : null}
        </dd>
        <dt>Membri în comitet ({members.length})</dt>
        <dd>
          {members.length
            ? members.map((m, i) => (
                <span key={m.id}>
                  {i ? ", " : ""}
                  <Link href={`/persoane/${m.id}`}>{m.name}</Link>
                </span>
              ))
            : "—"}
        </dd>
      </dl>
      {readOnly ? null : (
        <>
          <form action={action}>
            <div className="row2">
              <TextField name="alesLa" label="Data alegerii" type="date" defaultValue={v?.alesLa ?? alesLa ?? ""} error={state.errors?.alesLa} />
              <SelectField
                name="sedinta"
                label="Procesul-verbal al alegerii"
                defaultValue={v?.sedinta ?? sedinta?.id ?? ""}
                error={state.errors?.sedinta}
                options={[{ value: "", label: "— niciunul —" }, ...meetings]}
              />
            </div>
            <p className="hint !mt-0 mb-2">O dată nouă a alegerii începe un mandat nou (prelungirea nu se mai aplică).</p>
            <FormMessage state={state} />
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Se salvează…" : "Salvează mandatul"}
              </button>
            </div>
          </form>
          {alesLa && !prelungit ? (
            <form
              action={extend}
              onSubmit={(e) => {
                if (!window.confirm("Prelungiți mandatul comitetului cu 5 ani? Statutul permite o singură prelungire.")) e.preventDefault();
              }}
            >
              <FormMessage state={extState} />
              <div className="actions">
                <button type="submit" className="btn" disabled={extending}>
                  Prelungește mandatul cu 5 ani
                </button>
              </div>
            </form>
          ) : (
            <FormMessage state={extState} />
          )}
        </>
      )}
    </div>
  );
}
