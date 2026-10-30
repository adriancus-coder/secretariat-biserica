"use client";

import Link from "next/link";
import { useActionState, useCallback, useState } from "react";
import type { ChecklistOption } from "@/components/person-checklist";
import { Icon } from "@/components/shell/icons";
import { FormMessage } from "@/components/ui/form-bits";
import type { AttendanceRule } from "@/lib/attendance";
import { pickedNames, resolveImport, type ImportDraft } from "@/lib/minutes-import";
import type { MeetingFormState } from "@/server/actions/meetings";
import { importDocxMinutesAction, type DocxImportState } from "@/server/actions/minutes-import";
import { MeetingForm } from "../meeting-form";

interface FormProps {
  people: ChecklistOption[];
  tipuri: string[];
  rules: Record<string, AttendanceRule>;
  prefill: Record<"TOTI" | "COMITET", string[]>;
  tipuriAG: string[];
}

/**
 * Old minutes into the register: Word files, read locally (one or many). Each file is reviewed in
 * the meeting form and saved; "Următorul" moves to the next one.
 */
export function MinutesImport(form: FormProps) {
  const [docx, docxAction, docxPending] = useActionState(importDocxMinutesAction, {} as DocxImportState);
  // The files chosen: each is saved with its minutes as the original (MINUTES-IMPORT-ROBUST).
  const [files, setFiles] = useState<File[]>([]);
  const drafts = docx.drafts ?? null;

  if (drafts) return <Review drafts={drafts} skipped={docx.skipped ?? []} files={files} {...form} />;
  return (
    <form action={docxAction} className="card">
        <h3>Documente Word</h3>
        <p className="hint mb-3">
          Procese-verbale vechi scrise în Word. Vedeți întâi ce s-a recunoscut (număr, dată, tip, prezenți, puncte, voturi), corectați
          și importați. Textul nerecunoscut ajunge la Observații. Procesul-verbal importat este o copie de evidență (originalul semnat
          rămâne pe hârtie), iar fișierul Word se păstrează la el.
        </p>
        <div className="field">
          <label htmlFor="fisiere">Fișiere .docx (cel mult 30, fiecare până la 5 MB, în total până la 25 MB)</label>
          <input
            id="fisiere"
            name="fisiere"
            type="file"
            multiple
            required
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={docxPending}>
          <Icon name="documente" className="size-[18px]" />
          {docxPending ? "Se citesc fișierele…" : "Citește fișierele"}
        </button>
        <FormMessage state={docx} />
        <Skipped list={docx.skipped ?? []} />
      </form>
  );
}

function Skipped({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <div className="alert mt-3" role="alert">
      Nu au putut fi citite:
      <ul className="list-disc pl-5 mt-1">
        {list.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function Review({ drafts, skipped, files, ...form }: FormProps & { drafts: ImportDraft[]; skipped: string[]; files: File[] }) {
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState<Record<number, MeetingFormState>>({});
  const draft = drafts[index];
  const last = index === drafts.length - 1;
  const done = saved[index];
  const onImported = useCallback((s: MeetingFormState) => setSaved((all) => ({ ...all, [index]: s })), [index]);
  const savedCount = Object.keys(saved).length;

  return (
    <>
      {index === 0 ? <Skipped list={skipped} /> : null}
      <p className="hint mb-2" aria-live="polite">
        Fișierul {index + 1} din {drafts.length}: <b className="break-all">{draft.fileName}</b>
        {drafts.length > 1 ? ` · ${savedCount} salvate` : ""}
      </p>
      {done ? (
        <div className="card">
          <div className="alert alert-ok" role="status">
            {done.message}
          </div>
          <div className="actions">
            {last ? (
              <Link href="/procese-verbale" className="btn btn-primary">
                <Icon name="bifa" className="size-[18px]" /> Gata
              </Link>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setIndex(index + 1)}>
                <Icon name="sedinte" className="size-[18px]" /> Următorul
              </button>
            )}
            <Link href={`/procese-verbale/${done.savedId}`} className="btn" target="_blank">
              Deschide procesul-verbal
            </Link>
          </div>
        </div>
      ) : (
        <ReviewOne
          key={index}
          draft={draft}
          file={files.find((f) => f.name === draft.fileName)}
          onImported={onImported}
          onSkip={last ? undefined : () => setIndex(index + 1)}
          {...form}
        />
      )}
    </>
  );
}

function ReviewOne({
  draft,
  file,
  onImported,
  onSkip,
  people,
  ...form
}: FormProps & { draft: ImportDraft; file?: File; onImported: (s: MeetingFormState) => void; onSkip?: () => void }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<"dublu" | "fara" | "">("");
  const { selected, invitati } = resolveImport(draft, choices);
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <>
      <Recognized draft={draft} />
      {draft.conflict ? (
        <div className="card">
          <h3>Numărul este deja folosit</h3>
          <p className="hint mb-2">
            Numărul {draft.conflict.nr}/{draft.conflict.an} îl are deja „{draft.conflict.titlu}”. Numerele nu se schimbă automat; alegeți:
          </p>
          <fieldset className="choices">
            <legend className="sr-only">Numărul vechi</legend>
            {(
              [
                ["dublu", `Păstrează numărul ${draft.conflict.nr}, cu mențiunea „(număr dublu în evidența veche)”`],
                ["fara", "Importă fără număr; numărul vechi se trece la Observații"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="choice">
                <input type="radio" name="nrConflictAlegere" value={v} checked={conflict === v} onChange={() => setConflict(v)} />
                <span className="tick" aria-hidden="true">
                  <Icon name="bifa" className="size-[14px]" />
                </span>
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      ) : null}
      {draft.warnings.length ? (
        <div className="alert mb-4" role="status">
          Verificați datele citite din document:
          <ul className="list-disc pl-5 mt-2">
            {draft.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.approx.length ? (
        <div className="card">
          <h3>Potriviri de verificat</h3>
          <p className="hint mb-3">Numele scrise altfel decât în registru; debifați persoana în lista prezenților dacă nu este cea bună.</p>
          <ul className="space-y-1.5">
            {draft.approx.map((a) => (
              <li key={a.name}>
                „{a.name}” → <b>{byId.get(a.personId)?.name ?? "?"}</b> <span className="hint inline">· {a.how === "alias" ? "potrivit după o alegere anterioară" : "potrivit aproximativ"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.unmatched.length ? (
        <div className="card">
          <h3>Nepotriviți</h3>
          <p className="hint mb-3">
            Alegeți persoana din registru pentru fiecare nume, înainte de a completa restul formularului. Alegerea se ține minte pentru
            importurile următoare.
          </p>
          {draft.unmatched.map((u) => (
            <div className="field" key={u.name}>
              <label htmlFor={`nep-${u.name}`}>„{u.name}”</label>
              <select
                id={`nep-${u.name}`}
                value={choices[u.name] ?? ""}
                onChange={(e) => setChoices((c) => ({ ...c, [u.name]: e.target.value }))}
              >
                <option value="">Adaugă ca invitat</option>
                {u.candidates.length ? (
                  <optgroup label="Posibile potriviri">
                    {u.candidates.map((id) => (
                      <option key={id} value={id}>
                        {byId.get(id)?.name ?? id}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Toate persoanele">
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          ))}
        </div>
      ) : null}
      <MeetingForm
        key={JSON.stringify(choices)}
        id={null}
        initial={{ ...draft.initial, invitati }}
        points={draft.points}
        rich={draft.rich}
        selected={selected}
        people={people}
        cancelHref="/procese-verbale"
        onImported={onImported}
        pickedNames={pickedNames(draft, choices)}
        votes={draft.votes}
        extra={conflict ? { nrConflict: conflict } : undefined}
        originalFile={file}
        {...form}
      />
      {onSkip ? (
        <div className="actions">
          <button type="button" className="btn" onClick={onSkip}>
            Sari peste acest fișier
          </button>
        </div>
      ) : null}
    </>
  );
}

/** „Ce am recunoscut”: what the file gave, before the form below (where everything can be corrected). */
function Recognized({ draft }: { draft: ImportDraft }) {
  const i = draft.initial;
  const r = draft.recognized;
  const votes = draft.votes ?? [];
  const voteText = (v: (typeof votes)[number]) => (v ? ` — votat: pentru ${v.pentru}, contra ${v.contra}, abțineri ${v.abtineri}` : "");
  return (
    <div className="card">
      <h3>Ce am recunoscut</h3>
      <dl className="detail">
        <dt>Număr</dt>
        <dd>{i.nr || "—"}</dd>
        <dt>An</dt>
        <dd>{(i.data ?? "").slice(0, 4) || "—"}</dd>
        <dt>Data</dt>
        <dd>{i.data ? i.data.split("-").reverse().join(".") : "—"}</dd>
        <dt>Tip</dt>
        <dd>{i.tip || "—"}</dd>
        <dt>Prezenți</dt>
        <dd>{r?.prezenti.length ? `${r.prezenti.length}: ${r.prezenti.join(", ")}` : r?.numarPrezenti != null ? `${r.numarPrezenti} (doar numărul)` : "—"}</dd>
        {r?.ordine.length ? (
          <>
            <dt>Ordinea de zi</dt>
            <dd>{r.ordine.length} puncte</dd>
          </>
        ) : null}
        <dt>Puncte</dt>
        <dd>
          {draft.points.length ? (
            <ol className="list-decimal pl-5">
              {draft.points.map((p, k) => (
                <li key={k} className="whitespace-pre-line">
                  {p}
                  {voteText(votes[k] ?? null)}
                </li>
              ))}
            </ol>
          ) : (
            "niciun punct recunoscut"
          )}
        </dd>
        <dt>Încheiere</dt>
        <dd>{i.formulaIncheiere || "—"}</dd>
        <dt>Text nerecunoscut (merge la Observații)</dt>
        <dd>
          {r?.unrecognized.length ? (
            <ul className="list-disc pl-5">
              {r.unrecognized.map((t, k) => (
                <li key={k}>{t}</li>
              ))}
            </ul>
          ) : (
            "nimic"
          )}
        </dd>
      </dl>
      <p className="hint mt-2">Corectați în formularul de mai jos, apoi apăsați „Importă”; „Renunță” nu salvează nimic.</p>
    </div>
  );
}
