"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PersonChecklist, type ChecklistOption } from "@/components/person-checklist";
import { PreviewButton } from "@/components/rich-editor/preview-frame";
import { RichEditor } from "@/components/rich-editor/rich-editor";
import { Field, nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { ATTENDANCE_MODE_LABEL, ATTENDANCE_MODES, ATTENDANCE_RULE_LABEL, COUNT_MODE_COMMITTEE_HINT, countAboveExpected, countOnModeChange, type AttendanceMode, type AttendanceRule } from "@/lib/attendance";
import { AG_KIND_LABEL, convocationWarning, isGeneralAssembly, type Vote } from "@/lib/general-assembly";
import { DEFAULT_CLOSING } from "@/lib/minutes";
import type { PickedName } from "@/lib/minutes-import";
import { plainToRich, type RichDoc } from "@/lib/rich-text";
import { saveMeetingAction, type MeetingFormState } from "@/server/actions/meetings";
import { PointsEditor } from "./points-editor";

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function MeetingForm({
  id,
  initial,
  points,
  rich,
  selected,
  people,
  tipuri,
  rules,
  prefill,
  tipuriAG = [],
  votes,
  excused = [],
  cancelHref,
  onImported,
  pickedNames,
  extra,
  originalFile,
}: {
  /** Import review: extra hidden fields (the number conflict's choice). */
  extra?: Record<string, string>;
  /** Import review: the Word file read, saved with the minutes as its original. */
  originalFile?: File;
  /** Import review: the "Nepotriviți" names matched by hand, remembered as aliases on save. */
  pickedNames?: PickedName[];
  id: string | null;
  initial: Record<string, string>;
  /** The meeting's points ("Puncte discutate și aprobate"). */
  points: string[];
  /** The editor's documents, when the meeting has them (else built from the plain text). */
  rich?: { puncte: (RichDoc | null)[] | null; observatii: RichDoc | null; formula: RichDoc | null };
  selected: string[];
  people: ChecklistOption[];
  tipuri: string[];
  /** Attendance rule of each meeting type. */
  rules: Record<string, AttendanceRule>;
  /** The persons each automatic rule checks. */
  prefill: Record<"TOTI" | "COMITET", string[]>;
  /** Meeting types that are a General Assembly (empty = "Adunare generală"). */
  tipuriAG?: string[];
  /** The recorded votes, aligned with `points`. */
  votes?: (Vote | null)[] | null;
  /** Absences already excused (person ids). */
  excused?: string[];
  cancelHref: string;
  /** Import review: the meeting is saved without leaving the page; called with the saved state. */
  onImported?: (state: MeetingFormState) => void;
}) {
  const [attendees, setAttendees] = useState<Set<string>>(() => new Set(selected));
  const [tip, setTip] = useState(initial.tip ?? "");
  const rule = rules[tip] ?? "MANUAL";
  const ag = isGeneralAssembly(tip, tipuriAG);

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

  const { state, pending, onSubmit } = useActionForm<MeetingFormState>(saveMeetingAction.bind(null, id));
  useEffect(() => {
    if (state.ok && state.savedId) onImported?.(state);
  }, [state, onImported]);
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";
  const inRegister = people.filter((p) => !p.note).length;
  // The announcement's warning follows the dates as they are typed (Statut art. 46 alin. 1, art. 461).
  const [date, setDate] = useState(val("data"));
  const [convocatLa, setConvocatLa] = useState(val("convocatLa"));
  const [byCommunity, setByCommunity] = useState(val("convocataDeComunitate") === "on");
  const warning = ag && date ? convocationWarning(date, convocatLa || null, byCommunity) : null;
  // The expected persons not ticked become absentees on save; an absence can be excused (Statut art. 45).
  const names = new Map(people.map((p) => [p.id, p.name]));
  const absent = rule === "MANUAL" ? [] : prefill[rule].filter((pid) => !attendees.has(pid) && names.has(pid));
  const [excusedSet, setExcused] = useState<Set<string>>(() => new Set(excused));

  // ATTENDANCE-COUNT: „Pe nume” (the ticks) or „Doar numărul”.
  const [mode, setMode] = useState<AttendanceMode>(v.modPrezenta === "numar" ? "numar" : "nume");
  const [count, setCount] = useState(val("numarPrezenti"));
  const expectedCount = rule === "MANUAL" ? null : prefill[rule].length;
  const countNumber = /^\d+$/.test(count.trim()) ? Number(count.trim()) : null;
  const tooMany = mode === "numar" ? countAboveExpected(countNumber, expectedCount) : null;
  function changeMode(next: AttendanceMode) {
    if (next === mode) return;
    setMode(next);
    // To the number: as many as are ticked; back to the names: the number is cleared (the rule's list when nobody is ticked).
    setCount(countOnModeChange(next, attendees.size));
    if (next === "nume" && !attendees.size && rule !== "MANUAL") setAttendees(new Set(prefill[rule]));
  }
  // Saving by number removes the saved ticks (an existing meeting recorded by name): asked once, in the app.
  const formRef = useRef<HTMLFormElement>(null);
  const [ask, setAsk] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const removesTicks = mode === "numar" && id !== null && selected.length > 0;
  function submit(ev: FormEvent<HTMLFormElement>) {
    const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (removesTicks && !confirmed && submitter?.dataset.nativeSubmit === undefined) {
      ev.preventDefault();
      setAsk(true);
      return;
    }
    onSubmit(ev);
  }
  useEffect(() => {
    if (confirmed) formRef.current?.requestSubmit();
  }, [confirmed]);

  // The original Word file travels with the import's save (a file input filled from the file chosen before).
  const originalInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!originalFile || !originalInput.current) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(originalFile);
      originalInput.current.files = dt.files;
    } catch {
      // Without DataTransfer the minutes are imported without their original.
    }
  }, [originalFile]);

  const previewHost = `preview-${id ?? "nou"}`;
  // Built once: the editors keep their own state afterwards (also across validation errors).
  const [observatiiDoc] = useState(() => rich?.observatii ?? plainToRich(initial.observatii ?? ""));
  const [formulaDoc] = useState(() => rich?.formula ?? plainToRich(initial.formulaIncheiere || DEFAULT_CLOSING));

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="edit-split">
      <div className="edit-main">
      {id ? <input type="hidden" name="previewId" value={id} /> : null}
      {onImported ? <input type="hidden" name="import" value="1" /> : null}
      {pickedNames?.length ? <input type="hidden" name="aliasuri" value={JSON.stringify(pickedNames)} /> : null}
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {originalFile ? <input ref={originalInput} type="file" name="original" hidden tabIndex={-1} aria-hidden="true" /> : null}
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
        <TextField name="data" label="Data" type="date" defaultValue={val("data")} onChange={(ev) => setDate(ev.target.value)} error={e.data} required />
      </div>
      {ag ? (
        <fieldset className="card !mb-3">
          <legend className="font-semibold">Adunare Generală</legend>
          <div className="row2">
            <SelectField
              name="tipAG"
              label="Felul adunării"
              defaultValue={val("tipAG")}
              error={e.tipAG}
              options={[
                { value: "", label: "— nespecificat —" },
                ...Object.entries(AG_KIND_LABEL).map(([value, label]) => ({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })),
              ]}
            />
            <TextField
              name="convocatLa"
              label="Convocată (anunțată) la"
              type="date"
              defaultValue={val("convocatLa")}
              onChange={(ev) => setConvocatLa(ev.target.value)}
              error={e.convocatLa}
            />
          </div>
          <label className="check">
            <input type="checkbox" name="convocataDeComunitate" defaultChecked={byCommunity} onChange={(ev) => setByCommunity(ev.target.checked)} />
            Convocată de Comunitate (Statut art. 461)
          </label>
          <TextAreaField
            name="convocareText"
            label="Scopul adunării (anunțul)"
            defaultValue={val("convocareText")}
            error={e.convocareText}
            hint="Statut art. 46 alin. 1: anunțul precizează scopul adunării."
          />
          {warning ? (
            <p className="tag tag-warn !block whitespace-normal" role="status">
              {warning}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <div className="row2">
        <TextField name="ora" label="Ora" type="time" defaultValue={val("ora")} error={e.ora} />
        <TextField name="loc" label="Locul" defaultValue={val("loc")} error={e.loc} />
      </div>
      <TextField name="presedinte" label="Președinte de ședință" defaultValue={val("presedinte")} error={e.presedinte} />
      <fieldset className="attendance-mode" aria-describedby={rule === "COMITET" ? "count-mode-hint" : undefined}>
        <legend className="text-sm font-medium text-ink-2">Prezența</legend>
        <div className="attendance-mode-choices">
          {ATTENDANCE_MODES.map((m) => (
            <label key={m} className="choice">
              <input type="radio" name="modPrezenta" value={m} checked={mode === m} onChange={() => changeMode(m)} />
              {ATTENDANCE_MODE_LABEL[m]}
            </label>
          ))}
        </div>
        {rule === "COMITET" ? (
          <p id="count-mode-hint" className="hint !mt-1">
            {COUNT_MODE_COMMITTEE_HINT}
          </p>
        ) : null}
      </fieldset>
      {mode === "numar" ? (
        <>
          <TextField
            name="numarPrezenti"
            label="Număr de prezenți"
            inputMode="numeric"
            pattern="[0-9]*"
            value={count}
            onChange={(ev) => setCount(ev.target.value)}
            error={e.numarPrezenti}
            required
          />
          {tooMany ? (
            <p className="tag tag-warn !block whitespace-normal mb-3" role="status">
              {tooMany}
            </p>
          ) : null}
        </>
      ) : (
        <Field label={`Prezenți (${inRegister} în registru)`} error={e.prezenti}>
          <PersonChecklist name="prezenti" options={people} selected={attendees} onSelectedChange={setAttendees} />
        </Field>
      )}
      {mode === "nume" && absent.length ? (
        <Field label={`Absenți (${absent.length}) — bifați absențele motivate`}>
          <input type="hidden" name="motivatiForm" value="1" />
          <div className="checklist scroll-panel">
            {absent.map((pid) => (
              <label key={pid} className="check">
                <input
                  type="checkbox"
                  name="motivati"
                  value={pid}
                  checked={excusedSet.has(pid)}
                  onChange={(ev) =>
                    setExcused((s) => {
                      const next = new Set(s);
                      if (ev.target.checked) next.add(pid);
                      else next.delete(pid);
                      return next;
                    })
                  }
                />
                {names.get(pid)} <span className="text-ink-3 text-sm">motivat</span>
              </label>
            ))}
          </div>
        </Field>
      ) : null}
      <TextField name="invitati" label="Invitați / alte persoane" defaultValue={val("invitati")} error={e.invitati} />
      <TextAreaField name="ordine" label="Ordinea de zi" placeholder={"1. …\n2. …"} defaultValue={val("ordine")} error={e.ordine} />
      <PointsEditor initial={points} initialRich={rich?.puncte} initialVotes={votes} error={e.puncte ?? e.puncteRich ?? e.voturi} />
      <Field label="Observații (opțional)" htmlFor={`obs-${previewHost}`} error={e.observatii ?? e.observatiiRich}>
        <RichEditor name="observatiiRich" id={`obs-${previewHost}`} initial={observatiiDoc} label="Observații" minRows={3} invalid={Boolean(e.observatii ?? e.observatiiRich)} />
      </Field>
      <Field label="Formula de încheiere" htmlFor={`formula-${previewHost}`} error={e.formulaIncheiere ?? e.formulaRich}>
        <RichEditor name="formulaRich" id={`formula-${previewHost}`} initial={formulaDoc} label="Formula de încheiere" minRows={2} invalid={Boolean(e.formulaIncheiere ?? e.formulaRich)} />
      </Field>
      <FormMessage state={state} />
      {ask ? (
        <div className="alert mb-3" role="alertdialog" aria-labelledby="count-confirm">
          <p id="count-confirm" className="m-0">
            Lista de prezență pe nume ({selected.length} {selected.length === 1 ? "persoană" : "persoane"}) se șterge și rămâne doar numărul. Continuați?
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setAsk(false);
                setConfirmed(true);
              }}
            >
              Da, păstrează doar numărul
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAsk(false)}>
              Renunță
            </button>
          </div>
        </div>
      ) : null}
      <div className="actions">
        <Link href={cancelHref} className="btn btn-ghost">
          Renunță
        </Link>
        <div className="spacer" />
        <PreviewButton action="/pdf/proces-verbal/previzualizare" frameHostId={previewHost} />
        {/* A new minutes can be signed at once: „Semnează” saves it first (only the date and the type are required). */}
        {id === null && !onImported ? (
          <button type="submit" name="dupa" value="semneaza" className="btn" disabled={pending}>
            Semnează
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : onImported ? "Importă" : "Salvează"}
        </button>
      </div>
      </div>
      <aside id={previewHost} className="edit-preview" hidden aria-label="Previzualizare" />
    </form>
  );
}
