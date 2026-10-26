"use client";

import Link from "next/link";
import { SelectField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { RESOLUTION_SUGGESTIONS, type Direction } from "@/lib/correspondence";
import { saveCorrespondenceAction } from "@/server/actions/correspondence";

export interface CorrespondenceInitial {
  nr: string;
  data: string;
  directie: Direction;
  dela: string;
  catre: string;
  subiect: string;
  rezolvare: string;
  documentId: string;
  raspunsLaId: string;
  personId: string;
}

/** One entry or exit of the register: metadata only (who, when, about what, how it was solved). */
export function CorrespondenceForm({
  id,
  initial,
  nextNr,
  people,
  documents,
  answering,
  cancelHref,
}: {
  id: string | null;
  initial: CorrespondenceInitial;
  nextNr: string;
  people: { id: string; name: string }[];
  documents: { value: string; label: string }[];
  /** "Răspuns la intrarea nr. 3/2026 — …" when replying. */
  answering: string | null;
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(saveCorrespondenceAction.bind(null, id));
  const e = state.errors ?? {};
  const entry = initial.directie === "INTRARE";
  return (
    <form onSubmit={onSubmit} noValidate>
      <input type="hidden" name="directie" value={initial.directie} />
      <input type="hidden" name="raspunsLaId" value={initial.raspunsLaId} />
      {answering ? <p className="hint mb-3">{answering}</p> : null}
      <div className="row2">
        <TextField name="nr" label="Nr. de înregistrare" inputMode="numeric" defaultValue={initial.nr} placeholder={nextNr} error={e.nr} hint="Gol = următorul număr liber al anului." />
        <TextField name="data" label="Data" type="date" defaultValue={initial.data} error={e.data} required />
      </div>
      {entry ? (
        <TextField name="dela" label="De la (expeditor)" defaultValue={initial.dela} error={e.dela ?? e.directie} required autoComplete="off" />
      ) : (
        <TextField name="catre" label="Către (destinatar)" defaultValue={initial.catre} error={e.catre ?? e.directie} required autoComplete="off" />
      )}
      <TextField name="subiect" label="Subiect" defaultValue={initial.subiect} error={e.subiect} required autoComplete="off" />
      <TextField name="rezolvare" label="Rezolvare" list="rezolvari" defaultValue={initial.rezolvare} error={e.rezolvare} hint="De exemplu „În lucru”, „Clasat”, „Răspuns cu nr. …”." autoComplete="off" />
      <datalist id="rezolvari">
        {RESOLUTION_SUGGESTIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <div className="row2">
        <SelectField name="personId" label="Persoana din registru (opțional)" defaultValue={initial.personId} error={e.personId} emptyLabel="—" options={people.map((p) => ({ value: p.id, label: p.name }))} />
        {entry ? null : (
          <SelectField name="documentId" label="Documentul emis (opțional)" defaultValue={initial.documentId} error={e.documentId} emptyLabel="—" options={documents} />
        )}
      </div>
      <p className="hint">Se înregistrează doar datele scrisorii (cine, când, despre ce), nu și conținutul ei.</p>
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
