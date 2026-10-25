"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import type { Nomenclatures } from "@/lib/labels";
import { saveChurchSettingsAction } from "@/server/actions/settings";

type ChurchTextFields = "nume" | "adresa" | "orgNr" | "telefon" | "email" | "pastor" | "secretar" | "slug";

export function SettingsForm({
  church,
  nomen,
  formUrl,
  readOnly,
}: {
  church: Record<ChurchTextFields, string> & { applicationsOpen: boolean };
  nomen: Nomenclatures;
  /** Full address of the public application form, for the copy button. */
  formUrl: string;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(saveChurchSettingsAction, initialFormState);
  const v = state.values;
  const e = state.errors ?? {};
  const val = (k: ChurchTextFields) => v?.[k] ?? church[k];
  const applicationsOpen = v ? v.applicationsOpen === "on" : church.applicationsOpen;
  const nom = (name: string, label: string, list: string[]) => (
    <TextAreaField
      name={name}
      label={label}
      defaultValue={v?.[name] ?? list.join("\n")}
      error={e[name]}
      readOnly={readOnly}
      className="[&_textarea]:!min-h-[92px]"
    />
  );
  return (
    <form action={action} noValidate>
      <fieldset className="card" disabled={readOnly}>
        <h3>Organizația</h3>
        <TextField name="nume" label="Numele bisericii" placeholder="ex. Maranata Stavanger" defaultValue={val("nume")} error={e.nume} required />
        <TextField name="adresa" label="Adresă" defaultValue={val("adresa")} error={e.adresa} />
        <div className="row2 stack-sm">
          <TextField name="orgNr" label="Org.nr. / cod fiscal" defaultValue={val("orgNr")} error={e.orgNr} />
          <TextField name="telefon" label="Telefon" defaultValue={val("telefon")} error={e.telefon} />
        </div>
        <TextField name="email" label="E-mail" type="email" defaultValue={val("email")} error={e.email} />
        <div className="row2 stack-sm">
          <TextField name="pastor" label="Pastor" defaultValue={val("pastor")} error={e.pastor} hint="Semnează documentele." />
          <TextField name="secretar" label="Secretar" defaultValue={val("secretar")} error={e.secretar} hint="Semnează documentele și PV-urile." />
        </div>
        <TextField
          name="slug"
          label="Adresă publică a cererii"
          defaultValue={val("slug")}
          error={e.slug}
          autoComplete="off"
          spellCheck={false}
          hint={
            <>
              Formularul de cerere de membru:{" "}
              <a href={formUrl} target="_blank" rel="noopener noreferrer" className="break-all">
                {formUrl}
              </a>
            </>
          }
        />
        <div className="-mt-1.5 mb-3.5">
          <CopyButton text={formUrl} label="Copiază adresa" />
        </div>
        <label className="switch-row">
          <input type="checkbox" role="switch" name="applicationsOpen" defaultChecked={applicationsOpen} />
          <span>
            <span className="block font-medium">Primește cereri de membru online</span>
            <span className="hint block !mt-0">Când este pornit, oricine are adresa de mai sus poate trimite o cerere.</span>
          </span>
        </label>
      </fieldset>
      <fieldset className="card" disabled={readOnly}>
        <h3>Nomenclatoare</h3>
        <div className="hint mb-2.5">Câte o valoare pe linie. O listă goală revine la valorile implicite.</div>
        {nom("tipuriSedinte", "Tipuri de ședințe", nomen.tipuriSedinte)}
        {nom("tipuriEvenimente", "Tipuri de evenimente", nomen.tipuriEvenimente)}
        {nom("tipuriMentiuni", "Tipuri de mențiuni", nomen.tipuriMentiuni)}
        {nom("gradeRudenie", "Grade de rudenie", nomen.rudenie)}
        <p className="hint mb-2.5">
          Funcțiile din biserică (pastor, diacon, comitet …) au pagina lor: <Link href="/setari/functii">Funcții în biserică</Link>.
        </p>
        <div className="hint">
          Statistica folosește tipurile de eveniment „Nuntă” și „Înmormântare”, iar certificatul de binecuvântare
          gradele „Cap de familie”, „Soție” și „Părinte” — păstrați aceste denumiri.
        </div>
      </fieldset>
      <FormMessage state={state} />
      {!readOnly ? (
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : "Salvează setările"}
        </button>
      ) : (
        <p className="hint">Doar administratorul poate modifica setările.</p>
      )}
    </form>
  );
}
