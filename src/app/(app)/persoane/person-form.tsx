"use client";

import Link from "next/link";
import { nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { ENTRY_LABEL, ENTRY_MODES, EXIT_LABEL, EXIT_MODES, GENDER_LABEL, GENDERS, PERSON_STATUSES, STATUS_LABEL } from "@/lib/labels";
import { savePersonAction } from "@/server/actions/persons";

export type PersonFormValues = Record<string, string>;

const opts = <K extends string>(keys: readonly K[], labels: Record<K, string>) => keys.map((k) => ({ value: k, label: labels[k] }));

export function PersonForm({
  id,
  initial,
  families,
  rudenie,
  cancelHref,
}: {
  id: string | null;
  initial: PersonFormValues;
  families: string[];
  rudenie: string[];
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(savePersonAction.bind(null, id));
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="row2">
        <TextField name="nume" label="Nume" defaultValue={val("nume")} error={e.nume} required autoComplete="off" />
        <TextField name="prenume" label="Prenume" defaultValue={val("prenume")} error={e.prenume} autoComplete="off" />
      </div>
      <div className="row2">
        <SelectField name="statut" label="Statut" defaultValue={val("statut") || "MEMBRU"} error={e.statut} options={opts(PERSON_STATUSES, STATUS_LABEL)} />
        <SelectField name="gen" label="Gen" defaultValue={val("gen")} error={e.gen} emptyLabel="—" options={opts(GENDERS, GENDER_LABEL)} />
      </div>
      <div className="row2">
        <TextField name="familie" label="Familie" list="familii" placeholder="ex. Popescu" defaultValue={val("familie")} error={e.familie} autoComplete="off" />
        <SelectField name="rudenie" label="Grad de rudenie" defaultValue={val("rudenie")} error={e.rudenie} emptyLabel="—" options={nomenOptions(rudenie, val("rudenie"))} />
      </div>
      <datalist id="familii">
        {families.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <div className="row2">
        <TextField name="dataNasterii" label="Data nașterii" type="date" defaultValue={val("dataNasterii")} error={e.dataNasterii} />
        <TextField name="telefon" label="Telefon" type="tel" defaultValue={val("telefon")} error={e.telefon} />
      </div>
      <div className="row2">
        <TextField name="email" label="E-mail" type="email" defaultValue={val("email")} error={e.email} />
        <TextField name="adresa" label="Adresă" defaultValue={val("adresa")} error={e.adresa} />
      </div>

      <fieldset className="card">
        <h3>Intrare în biserică</h3>
        <div className="row2">
          <TextField
            name="dataMembru"
            label="Data intrării"
            type="date"
            defaultValue={val("dataMembru")}
            error={e.dataMembru}
            hint="Folosită pentru statistica retroactivă."
          />
          <SelectField name="modIntrare" label="Mod" defaultValue={val("modIntrare")} error={e.modIntrare} emptyLabel="—" options={opts(ENTRY_MODES, ENTRY_LABEL)} />
        </div>
        <TextField
          name="bisericaProvenienta"
          label="Biserica de proveniență (la transfer)"
          defaultValue={val("bisericaProvenienta")}
          error={e.bisericaProvenienta}
        />
        <div className="row2">
          <TextField name="dataBotez" label="Botez în apă" type="date" defaultValue={val("dataBotez")} error={e.dataBotez} />
          <TextField name="locBotez" label="Locul botezului" defaultValue={val("locBotez")} error={e.locBotez} />
        </div>
        <TextField
          name="dataBinecuvantare"
          label="Binecuvântare ca copil"
          type="date"
          defaultValue={val("dataBinecuvantare")}
          error={e.dataBinecuvantare}
          className="mb-0"
        />
      </fieldset>

      <fieldset className="card">
        <h3>Ieșire din evidență</h3>
        <div className="row2">
          <TextField name="dataIesire" label="Data ieșirii" type="date" defaultValue={val("dataIesire")} error={e.dataIesire} />
          <SelectField name="modIesire" label="Mod" defaultValue={val("modIesire")} error={e.modIesire} emptyLabel="—" options={opts(EXIT_MODES, EXIT_LABEL)} />
        </div>
        <TextField
          name="bisericaDestinatie"
          label="Biserica de destinație (la transfer)"
          defaultValue={val("bisericaDestinatie")}
          error={e.bisericaDestinatie}
          hint="Cu dată de ieșire (în afară de deces), statutul devine automat „Fost membru”."
          className="mb-0"
        />
      </fieldset>

      <TextField
        name="slujire"
        label="Slujire / responsabilități"
        placeholder="ex. cor, tineret, diacon"
        defaultValue={val("slujire")}
        error={e.slujire}
      />
      <TextAreaField name="note" label="Note" defaultValue={val("note")} error={e.note} />

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
