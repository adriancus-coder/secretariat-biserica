"use client";

import Link from "next/link";
import { useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { ASSET_ORIGIN_LABEL, ASSET_STATE_LABEL } from "@/lib/patrimony";
import { saveAssetAction } from "@/server/actions/assets";

export interface AssetInitial {
  nrInventar: string;
  denumire: string;
  categorie: string;
  subcategoryId: string;
  cantitate: string;
  valoare: string;
  dataIntrarii: string;
  provenienta: string;
  loc: string;
  stare: string;
  observatii: string;
  responsabil: string;
  responsabilId: string;
}

/** A good of the inventory (Statut art. 43 alin. 7). Leaving use is a separate action ("Scoate din uz"). */
export function AssetForm({
  id,
  initial,
  nextNr,
  categories,
  subcategories,
  people,
  cancelHref,
}: {
  id: string | null;
  initial: AssetInitial;
  nextNr: string;
  categories: string[];
  /** PATRIMONY-SUBCATEGORIES: every subcategory of the church; the select shows the chosen category's. */
  subcategories: { id: string; categorie: string; nume: string }[];
  people: { id: string; name: string }[];
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(saveAssetAction.bind(null, id));
  const e = state.errors ?? {};
  const cats = initial.categorie && !categories.includes(initial.categorie) ? [...categories, initial.categorie] : categories;
  const [categorie, setCategorie] = useState(state.values?.categorie ?? initial.categorie);
  const [subId, setSubId] = useState(state.values?.subcategoryId ?? initial.subcategoryId);
  const subs = subcategories.filter((s) => s.categorie === categorie);
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="row2">
        <TextField name="nrInventar" label="Nr. de inventar" inputMode="numeric" defaultValue={initial.nrInventar} placeholder={nextNr} error={e.nrInventar} hint="Gol = următorul număr liber." />
        <SelectField
          name="categorie"
          label="Categorie"
          value={categorie}
          onChange={(ev) => {
            // Changing the category clears the subcategory (it belongs to the old one).
            setCategorie(ev.target.value);
            setSubId("");
          }}
          error={e.categorie}
          options={cats.map((c) => ({ value: c, label: c }))}
          required
        />
      </div>
      {subs.length ? (
        <SelectField
          name="subcategoryId"
          label="Subcategorie (opțional)"
          value={subs.some((s) => s.id === subId) ? subId : ""}
          onChange={(ev) => setSubId(ev.target.value)}
          error={e.subcategoryId}
          emptyLabel="—"
          options={subs.map((s) => ({ value: s.id, label: s.nume }))}
        />
      ) : null}
      <TextField name="denumire" label="Denumire" defaultValue={initial.denumire} error={e.denumire} required autoComplete="off" />
      <div className="row2">
        <TextField name="cantitate" label="Cantitate" inputMode="numeric" defaultValue={initial.cantitate} error={e.cantitate} />
        <TextField name="valoare" label="Valoare (NOK, opțional)" inputMode="numeric" defaultValue={initial.valoare} error={e.valoare} hint="Valoarea întregii poziții, fără zecimale." />
      </div>
      <div className="row2">
        <TextField name="dataIntrarii" label="Data intrării" type="date" defaultValue={initial.dataIntrarii} error={e.dataIntrarii} />
        <SelectField name="provenienta" label="Proveniență" defaultValue={initial.provenienta} error={e.provenienta} options={Object.entries(ASSET_ORIGIN_LABEL).map(([value, label]) => ({ value, label }))} />
      </div>
      <div className="row2">
        <TextField name="loc" label="Unde se află" defaultValue={initial.loc} error={e.loc} autoComplete="off" />
        <SelectField
          name="stare"
          label="Stare"
          defaultValue={initial.stare}
          error={e.stare}
          options={(["BUN", "NECESITA_REPARATII"] as const).map((value) => ({ value, label: ASSET_STATE_LABEL[value] }))}
        />
      </div>
      <div className="row2">
        <SelectField name="responsabilId" label="Responsabil din registru" defaultValue={initial.responsabilId} error={e.responsabilId} emptyLabel="—" options={people.map((p) => ({ value: p.id, label: p.name }))} />
        <TextField name="responsabil" label="sau responsabil (text)" defaultValue={initial.responsabil} error={e.responsabil} autoComplete="off" />
      </div>
      <TextAreaField name="observatii" label="Observații" defaultValue={initial.observatii} error={e.observatii} />
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
