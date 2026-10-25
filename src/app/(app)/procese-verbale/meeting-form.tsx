"use client";

import Link from "next/link";
import { useState } from "react";
import { PersonChecklist, type ChecklistOption } from "@/components/person-checklist";
import { Field, nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { ATTENDANCE_RULE_LABEL, type AttendanceRule } from "@/lib/attendance";
import { DEFAULT_CLOSING } from "@/lib/minutes";
import { saveMeetingAction } from "@/server/actions/meetings";
import { PointsEditor } from "./points-editor";

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function MeetingForm({
  id,
  initial,
  points,
  selected,
  people,
  tipuri,
  rules,
  prefill,
  cancelHref,
}: {
  id: string | null;
  initial: Record<string, string>;
  /** The meeting's points ("Puncte discutate și aprobate"). */
  points: string[];
  selected: string[];
  people: ChecklistOption[];
  tipuri: string[];
  /** Attendance rule of each meeting type. */
  rules: Record<string, AttendanceRule>;
  /** The persons each automatic rule checks. */
  prefill: Record<"TOTI" | "COMITET", string[]>;
  cancelHref: string;
}) {
  const [attendees, setAttendees] = useState<Set<string>>(() => new Set(selected));
  const [tip, setTip] = useState(initial.tip ?? "");
  const rule = rules[tip] ?? "MANUAL";

  /** A new type with an automatic rule refills the list; a non-empty, different list is replaced only after confirmation. */
  function changeType(next: string) {
    setTip(next);
    const r = rules[next] ?? "MANUAL";
    if (r === "MANUAL") return;
    const ids = new Set(prefill[r]);
    if (sameSet(ids, attendees)) return;
    if (attendees.size && !window.confirm(`Înlocuiesc lista de prezență cu „${ATTENDANCE_RULE_LABEL[r]}” (${ids.size} persoane)?`)) return;
    setAttendees(ids);
  }

  const { state, pending, onSubmit } = useActionForm(saveMeetingAction.bind(null, id));
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";
  const inRegister = people.filter((p) => !p.note).length;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="row2">
        <TextField
          name="nr"
          label="Număr proces-verbal"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={val("nr")}
          error={e.nr}
          hint="Gol: următorul număr liber din anul ședinței."
        />
        <TextField name="titlu" label="Titlu" placeholder="ex. Planificare toamnă" defaultValue={val("titlu")} error={e.titlu} />
      </div>
      <div className="row2">
        <SelectField
          name="tip"
          label="Tip"
          value={tip}
          onChange={(ev) => changeType(ev.target.value)}
          error={e.tip}
          options={nomenOptions(tipuri, tip)}
          hint={rule === "MANUAL" ? undefined : `Prezența: ${ATTENDANCE_RULE_LABEL[rule].toLowerCase()} (cei debifați apar ca absenți).`}
        />
        <TextField name="data" label="Data" type="date" defaultValue={val("data")} error={e.data} required />
      </div>
      <div className="row2">
        <TextField name="ora" label="Ora" type="time" defaultValue={val("ora")} error={e.ora} />
        <TextField name="loc" label="Locul" defaultValue={val("loc")} error={e.loc} />
      </div>
      <TextField name="presedinte" label="Președinte de ședință" defaultValue={val("presedinte")} error={e.presedinte} />
      <Field label={`Prezenți (${inRegister} în registru)`} error={e.prezenti}>
        <PersonChecklist name="prezenti" options={people} selected={attendees} onSelectedChange={setAttendees} />
      </Field>
      <TextField name="invitati" label="Invitați / alte persoane" defaultValue={val("invitati")} error={e.invitati} />
      <TextAreaField name="ordine" label="Ordinea de zi" placeholder={"1. …\n2. …"} defaultValue={val("ordine")} error={e.ordine} />
      <PointsEditor initial={points} error={e.puncte} />
      <TextAreaField name="observatii" label="Observații (opțional)" defaultValue={val("observatii")} error={e.observatii} />
      <TextField
        name="formulaIncheiere"
        label="Formula de încheiere"
        defaultValue={val("formulaIncheiere") || DEFAULT_CLOSING}
        error={e.formulaIncheiere}
      />
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
