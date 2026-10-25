"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/icons";
import { nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { APPLICATION_KIND_LABEL, APPLICATION_KINDS, GENDER_LABEL, GENDERS, type ApplicationKindKey } from "@/lib/labels";
import { APPLICATION_MESSAGE_MAX } from "@/lib/schemas/application";
import { submitApplicationAction } from "@/server/actions/applications";

export function ApplicationForm({ slug, rudenie }: { slug: string; rudenie: string[] }) {
  const { state, pending, onSubmit } = useActionForm(submitApplicationAction.bind(null, slug));
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const [kind, setKind] = useState<ApplicationKindKey | "">((v.kind as ApplicationKindKey) || "");

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="choices" aria-describedby={e.kind ? "f-kind-err" : undefined}>
        <legend>Tipul cererii</legend>
        {APPLICATION_KINDS.map((k) => (
          <label key={k} className="choice">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            <span className="tick" aria-hidden="true">
              <Icon name="bifa" className="size-[14px]" />
            </span>
            {APPLICATION_KIND_LABEL[k]}
          </label>
        ))}
        {e.kind ? (
          <div className="field-error" id="f-kind-err" role="alert">
            {e.kind}
          </div>
        ) : null}
      </fieldset>

      <div className="row2 stack-sm">
        <TextField name="nume" label="Nume" defaultValue={v.nume ?? ""} error={e.nume} autoComplete="family-name" required />
        <TextField name="prenume" label="Prenume" defaultValue={v.prenume ?? ""} error={e.prenume} autoComplete="given-name" required />
      </div>
      <div className="row2 stack-sm">
        <SelectField
          name="gen"
          label="Gen"
          defaultValue={v.gen ?? ""}
          error={e.gen}
          emptyLabel="—"
          options={GENDERS.map((g) => ({ value: g, label: GENDER_LABEL[g] }))}
        />
        <TextField name="dataNasterii" label="Data nașterii" type="date" defaultValue={v.dataNasterii ?? ""} error={e.dataNasterii} />
      </div>
      <div className="row2 stack-sm">
        <TextField name="telefon" label="Telefon" type="tel" defaultValue={v.telefon ?? ""} error={e.telefon} autoComplete="tel" />
        <TextField name="email" label="E-mail" type="email" defaultValue={v.email ?? ""} error={e.email} autoComplete="email" inputMode="email" />
      </div>
      <TextField name="adresa" label="Adresă" defaultValue={v.adresa ?? ""} error={e.adresa} autoComplete="street-address" />
      <div className="row2 stack-sm">
        <TextField
          name="familie"
          label="Familie"
          defaultValue={v.familie ?? ""}
          error={e.familie}
          hint="Numele familiei, dacă aveți rude în biserică."
        />
        <SelectField
          name="rudenie"
          label="Grad de rudenie"
          defaultValue={v.rudenie ?? ""}
          error={e.rudenie}
          emptyLabel="—"
          options={nomenOptions(rudenie)}
        />
      </div>

      {kind === "TRANSFER" ? (
        <fieldset className="card">
          <h3>Transfer</h3>
          <TextField
            name="bisericaProvenienta"
            label="Biserica de proveniență"
            defaultValue={v.bisericaProvenienta ?? ""}
            error={e.bisericaProvenienta}
          />
          <fieldset className="subfields">
            <legend>Botez în apă</legend>
            <div className="row2 stack-sm">
              <TextField name="dataBotez" label="Data botezului" type="date" defaultValue={v.dataBotez ?? ""} error={e.dataBotez} />
              <TextField name="botezBiserica" label="Biserica" defaultValue={v.botezBiserica ?? ""} error={e.botezBiserica} />
            </div>
            <div className="row2 stack-sm">
              <TextField name="botezLocalitate" label="Localitatea" defaultValue={v.botezLocalitate ?? ""} error={e.botezLocalitate} />
              <TextField name="botezOficiant" label="Oficiat de" defaultValue={v.botezOficiant ?? ""} error={e.botezOficiant} />
            </div>
          </fieldset>
        </fieldset>
      ) : null}

      <TextAreaField name="mesaj" label="Mesaj (opțional)" defaultValue={v.mesaj ?? ""} error={e.mesaj} maxLength={APPLICATION_MESSAGE_MAX} />

      <div className="hp" aria-hidden="true">
        <label htmlFor="f-website">Site web</label>
        <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="consent">
        <input type="checkbox" name="consent" defaultChecked={v.consent === "on"} aria-invalid={e.consent ? true : undefined} />
        <span>Sunt de acord ca datele mele să fie păstrate de biserică în scopul evidenței membrilor.</span>
      </label>
      {e.consent ? (
        <div className="field-error mb-3" role="alert">
          {e.consent}
        </div>
      ) : null}

      <FormMessage state={state} />
      <button type="submit" className="btn btn-primary w-full min-h-11 mt-2" disabled={pending}>
        <Icon name="trimite" className="size-[18px]" />
        {pending ? "Se trimite…" : "Trimite cererea"}
      </button>
    </form>
  );
}
