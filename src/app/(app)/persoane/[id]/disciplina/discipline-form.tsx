"use client";

import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { todayIso } from "@/lib/dates";
import {
  DISCIPLINARY_FORM_LABEL,
  DISCIPLINARY_FORMS,
  DISCIPLINARY_FORUM_LABEL,
  DISCIPLINARY_FORUMS,
  DISCIPLINARY_STATE_LABEL,
  DISCIPLINARY_STATES,
} from "@/lib/labels";
import { APPEAL_RESULT_LABEL, APPEAL_RESULTS } from "@/lib/schemas/discipline";
import { saveDisciplineAction } from "@/server/actions/discipline";

const opts = <K extends string>(keys: readonly K[], labels: Record<K, string>) => keys.map((k) => ({ value: k, label: labels[k] }));

/** Adds or edits a disciplinary measure (administrators only). */
export function DisciplineForm({
  personId,
  measureId,
  initial,
  meetings,
}: {
  personId: string;
  measureId: string | null;
  initial: Record<string, string>;
  meetings: { value: string; label: string }[];
}) {
  const { state, pending, onSubmit } = useActionForm(saveDisciplineAction.bind(null, personId, measureId));
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="row2">
        <SelectField name="forma" label="Forma (Statut art. 27 alin. 3)" defaultValue={val("forma")} error={e.forma} emptyLabel="—" options={opts(DISCIPLINARY_FORMS, DISCIPLINARY_FORM_LABEL)} />
        <SelectField name="stare" label="Stare" defaultValue={val("stare") || "CERCETARE"} error={e.stare} options={opts(DISCIPLINARY_STATES, DISCIPLINARY_STATE_LABEL)} />
      </div>
      <div className="row2">
        <TextField name="dataInceput" label="Data" type="date" defaultValue={val("dataInceput") || todayIso()} error={e.dataInceput} />
        <TextField name="dataSfarsit" label="Data încheierii" type="date" defaultValue={val("dataSfarsit")} error={e.dataSfarsit} />
      </div>
      <div className="row2">
        <SelectField
          name="meetingId"
          label="Procesul-verbal"
          defaultValue={val("meetingId")}
          error={e.meetingId}
          emptyLabel="—"
          options={meetings}
          hint="Măsurile c)–e) se consemnează în procesul-verbal semnat de conducere (art. 27 alin. 10)."
        />
        <SelectField name="decisByForum" label="Forul care a decis" defaultValue={val("decisByForum") || "LOCAL"} error={e.decisByForum} options={opts(DISCIPLINARY_FORUMS, DISCIPLINARY_FORUM_LABEL)} />
      </div>
      <TextAreaField name="motiv" label="Motivul" defaultValue={val("motiv")} error={e.motiv} rows={3} />
      <fieldset className="subfields">
        <legend>Audiere în fața comitetului (art. 272 lit. a)</legend>
        <div className="row2">
          <TextField name="audiereLa" label="Data audierii" type="date" defaultValue={val("audiereLa")} error={e.audiereLa} />
          <TextField name="audiereOra" label="Ora" type="time" defaultValue={val("audiereOra")} error={e.audiereOra} />
        </div>
        <TextField name="audiereLoc" label="Locul" defaultValue={val("audiereLoc")} error={e.audiereLoc} hint="Gol: sediul bisericii." />
      </fieldset>
      <fieldset className="subfields">
        <legend>Încheierea cercetării (art. 272 lit. c)</legend>
        <p className="hint !mt-0 mb-2">Obligatorii la trecerea din „În cercetare”, împreună cu procesul-verbal al ședinței de comitet. Apar doar în „PV disciplinar”.</p>
        <TextAreaField name="abatere" label="Abaterea constatată" defaultValue={val("abatere")} error={e.abatere} rows={3} />
        <TextAreaField name="raspuns" label="Răspunsul persoanei" defaultValue={val("raspuns")} error={e.raspuns} rows={3} />
        <label className="check">
          <input type="checkbox" name="nuSaPrezentat" defaultChecked={val("nuSaPrezentat") === "on"} />
          Nu s-a prezentat la audiere (art. 272 lit. b)
        </label>
        <div className="row2">
          <TextField name="incadrare" label="Încadrarea statutară" placeholder="ex. art. 27 alin. 13 lit. b" defaultValue={val("incadrare")} error={e.incadrare} />
          <TextField name="temei" label="Temeiul statutar" placeholder="ex. art. 27 alin. 3 lit. d" defaultValue={val("temei")} error={e.temei} />
        </div>
      </fieldset>
      <fieldset className="subfields">
        <legend>Comunicare și contestație (art. 27 alin. 10–11)</legend>
        <div className="row2">
          <TextField name="comunicatLa" label="Comunicată persoanei la" type="date" defaultValue={val("comunicatLa")} error={e.comunicatLa} hint="Termenul de contestare: 15 zile." />
          <TextField name="contestatieLa" label="Contestație depusă la" type="date" defaultValue={val("contestatieLa")} error={e.contestatieLa} />
        </div>
        <SelectField
          name="contestatieRezultat"
          label="Rezultatul contestației"
          defaultValue={val("contestatieRezultat")}
          error={e.contestatieRezultat}
          options={[{ value: "", label: "—" }, ...APPEAL_RESULTS.map((r) => ({ value: r, label: APPEAL_RESULT_LABEL[r].charAt(0).toUpperCase() + APPEAL_RESULT_LABEL[r].slice(1) }))]}
        />
      </fieldset>
      <FormMessage state={state} />
      <div className="actions">
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : measureId ? "Salvează măsura" : "Adaugă măsura"}
        </button>
      </div>
    </form>
  );
}
