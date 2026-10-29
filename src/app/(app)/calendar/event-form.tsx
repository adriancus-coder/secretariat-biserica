"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { OfficiantField } from "@/components/officiant-field";
import { visibleEventFields } from "@/lib/event-fields";
import type { OfficiantOption } from "@/lib/officiants";
import type { EventPersonInput } from "@/lib/event-persons";
import { saveEventAction } from "@/server/actions/events";
import type { EventFamilyOption, EventPersonOption } from "@/server/queries/event-persons";
import { EventPersonsField } from "./event-persons-field";

interface Contribution {
  key: number;
  cine: string;
  ce: string;
}

export function EventForm({
  id,
  initial,
  contributii,
  tipuri,
  officiants = [],
  cancelHref,
  familyOptions,
  personOptions,
  persoane = [],
}: {
  id: string | null;
  initial: Record<string, string>;
  contributii: { cine: string; ce: string }[];
  tipuri: string[];
  /** Persons holding an ordained role (Statut art. 30). */
  officiants?: OfficiantOption[];
  cancelHref: string;
  /** EVENT-PERSONS: the families and persons offered, and the event's persons. */
  familyOptions: EventFamilyOption[];
  personOptions: EventPersonOption[];
  persoane?: EventPersonInput[];
}) {
  const { state, pending, onSubmit } = useActionForm(saveEventAction.bind(null, id));
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";
  const nextKey = useRef(contributii.length);
  const [tip, setTip] = useState(val("tip"));
  const [agapa, setAgapa] = useState(initial.agapaActiva === "on");
  // The title is suggested from the persons only while empty (or still the last suggestion).
  const [titlu, setTitlu] = useState(val("titlu"));
  const lastSuggestion = useRef("");
  const onTitle = useCallback((t: string) => {
    setTitlu((cur) => {
      if (cur.trim() && cur !== lastSuggestion.current) return cur;
      lastSuggestion.current = t;
      return t;
    });
  }, []);
  // EVENT-FIELDS-BY-TYPE: the type's fields, plus those the saved event has a value in.
  const shown = visibleEventFields(tip, {
    ...initial,
    agapaActiva: initial.agapaActiva === "on",
    contributii: contributii.length,
    persoane: persoane.length,
  });
  // „Alt loc decât biserica”: unticked = the event is at the church (the place is saved empty).
  const [altLoc, setAltLoc] = useState(Boolean(initial.loc?.trim()) || Boolean(state.values?.loc));
  const [rows, setRows] = useState<Contribution[]>(() => contributii.map((c, i) => ({ key: i, ...c })));

  function addRow() {
    setRows((r) => [...r, { key: nextKey.current++, cine: "", ce: "" }]);
  }
  function removeRow(key: number) {
    setRows((r) => r.filter((x) => x.key !== key));
  }
  function updateRow(key: number, field: "cine" | "ce", value: string) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: value } : x)));
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <TextField name="titlu" label="Titlu" placeholder="ex. Seară de evanghelizare" value={titlu} onChange={(ev) => setTitlu(ev.target.value)} error={e.titlu} required />
      <div className="row2">
        <SelectField name="tip" label="Tip" defaultValue={val("tip")} onChange={(ev) => setTip(ev.target.value)} error={e.tip} options={nomenOptions(tipuri, val("tip"))} />
        <TextField name="data" label="Data" type="date" defaultValue={val("data")} error={e.data} required />
      </div>
      {/* EVENT-FIELDS-BY-TYPE: hidden fields stay in the form (hidden), so nothing typed is lost. */}
      <div hidden={!shown.has("persoane")}>
        <EventPersonsField
          tip={tip}
          initialFamilyId={initial.familyId ?? ""}
          initialPersons={persoane}
          families={familyOptions}
          persons={personOptions}
          error={e.persoane ?? e.familyId}
          onTitle={onTitle}
        />
      </div>
      <div className="row2">
        <div hidden={!shown.has("ora")}>
          <TextField name="ora" label="Ora (opțional)" type="time" placeholder="oo:mm" defaultValue={val("ora")} error={e.ora} />
        </div>
        <div>
          <label className="check !border-0">
            <input type="checkbox" name="altLoc" checked={altLoc} onChange={(ev) => setAltLoc(ev.target.checked)} />
            Alt loc decât biserica
          </label>
          <div hidden={!altLoc}>
            <TextField name="loc" label="Loc" defaultValue={val("loc")} error={e.loc} />
          </div>
        </div>
      </div>
      <div className="row2">
        <div hidden={!shown.has("invitat")}>
          <TextField name="invitat" label="Invitat / vorbitor" defaultValue={val("invitat")} error={e.invitat} />
        </div>
        <div hidden={!shown.has("responsabil")}>
          <TextField name="responsabil" label="Responsabil" defaultValue={val("responsabil")} error={e.responsabil} />
        </div>
      </div>
      <div hidden={!shown.has("oficiant")}>
        <OfficiantField name="oficiant" act={tip} defaultValue={val("oficiant")} options={officiants} error={e.oficiant} />
      </div>
      <div hidden={!shown.has("descriere")}>
        <TextAreaField name="descriere" label="Descriere / program" defaultValue={val("descriere")} error={e.descriere} />
      </div>

      <fieldset className="card" hidden={!shown.has("agapa")}>
        <label className="check !border-0 !pt-0">
          <input type="checkbox" name="agapaActiva" checked={agapa} onChange={(ev) => setAgapa(ev.target.checked)} />
          Cu agapă (masă comună)
        </label>
        {/* Câmpurile rămân în formular și când agapa e debifată (ca în prototip), doar ascunse. */}
        <div hidden={!agapa}>
          <div className="row2">
            <TextField name="agapaResponsabil" label="Responsabil agapă" defaultValue={val("agapaResponsabil")} error={e.agapaResponsabil} />
            <TextField
              name="agapaPersoane"
              label="Persoane (aprox.)"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={val("agapaPersoane")}
              error={e.agapaPersoane}
            />
          </div>
          <label>Cine aduce ce</label>
          <div>
            {rows.map((r) => (
              <div key={r.key} className="flex gap-2 items-center py-2 border-b border-line">
                {/* Câmpuri controlate: nu se golesc la resetarea formularului după o eroare de validare. */}
                <input name="contrib_cine" placeholder="Cine" value={r.cine} onChange={(ev) => updateRow(r.key, "cine", ev.target.value)} aria-label="Cine" />
                <input name="contrib_ce" placeholder="Ce aduce" value={r.ce} onChange={(ev) => updateRow(r.key, "ce", ev.target.value)} aria-label="Ce aduce" />
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeRow(r.key)} aria-label="Elimină rândul">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-sm mt-2" onClick={addRow}>
            + Adaugă contribuție
          </button>
          {e.contributii ? <div className="field-error">{e.contributii}</div> : null}
        </div>
      </fieldset>

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
