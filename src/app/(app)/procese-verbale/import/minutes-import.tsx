"use client";

import Link from "next/link";
import { useActionState, useCallback, useState } from "react";
import type { ChecklistOption } from "@/components/person-checklist";
import { Icon } from "@/components/shell/icons";
import { DocumentUploadFields } from "@/components/ui/document-upload";
import { FormMessage } from "@/components/ui/form-bits";
import type { AttendanceRule } from "@/lib/attendance";
import { resolveImport, type ImportDraft } from "@/lib/minutes-import";
import { extractMinutesAction, type ExtractMinutesState } from "@/server/actions/extract";
import type { MeetingFormState } from "@/server/actions/meetings";
import { importDocxMinutesAction, type DocxImportState } from "@/server/actions/minutes-import";
import { MeetingForm } from "../meeting-form";

interface FormProps {
  people: ChecklistOption[];
  tipuri: string[];
  rules: Record<string, AttendanceRule>;
  prefill: Record<"TOTI" | "COMITET", string[]>;
}

/**
 * Old minutes into the register: Word files (read locally, one or many) or a scan / photo (read
 * with Claude when configured). Each file is reviewed in the meeting form and saved; "Următorul"
 * moves to the next one.
 */
export function MinutesImport({ aiConfigured, ...form }: FormProps & { aiConfigured: boolean }) {
  const [docx, docxAction, docxPending] = useActionState(importDocxMinutesAction, {} as DocxImportState);
  const [ai, aiAction, aiPending] = useActionState(extractMinutesAction, {} as ExtractMinutesState);
  const drafts = docx.drafts ?? (ai.meeting ? [ai.meeting] : null);

  if (drafts) return <Review drafts={drafts} skipped={docx.skipped ?? []} {...form} />;
  return (
    <>
      <form action={docxAction} className="card">
        <h3>Documente Word</h3>
        <p className="hint mb-3">
          Procese-verbale scrise în Word după modelul bisericii. Numărul, data, tipul, prezenții și punctele completează formularul
          ședinței, pe care îl verificați înainte de salvare. Fișierele nu se păstrează.
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
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={docxPending}>
          <Icon name="documente" className="size-[18px]" />
          {docxPending ? "Se citesc fișierele…" : "Citește fișierele"}
        </button>
        <FormMessage state={docx} />
        <Skipped list={docx.skipped ?? []} />
      </form>
      <form action={aiAction} className="card">
        <h3>Document scanat sau fotografie</h3>
        {aiConfigured ? (
          <>
            <p className="hint mb-3">Un proces-verbal scanat (PDF) sau fotografiat, citit automat. Documentul nu se păstrează.</p>
            <DocumentUploadFields pending={aiPending} hint="Numele negăsite în registru apar la „Nepotriviți”." />
            <FormMessage state={ai} />
          </>
        ) : (
          <p className="hint">Citirea automată a documentelor scanate nu este pornită (Setări → Confidențialitate).</p>
        )}
      </form>
    </>
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

function Review({ drafts, skipped, ...form }: FormProps & { drafts: ImportDraft[]; skipped: string[] }) {
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
        <ReviewOne key={index} draft={draft} onImported={onImported} onSkip={last ? undefined : () => setIndex(index + 1)} {...form} />
      )}
    </>
  );
}

function ReviewOne({
  draft,
  onImported,
  onSkip,
  people,
  ...form
}: FormProps & { draft: ImportDraft; onImported: (s: MeetingFormState) => void; onSkip?: () => void }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const { selected, invitati } = resolveImport(draft, choices);
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <>
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
                „{a.name}” → <b>{byId.get(a.personId)?.name ?? "?"}</b> <span className="hint inline">· potrivit aproximativ</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.unmatched.length ? (
        <div className="card">
          <h3>Nepotriviți</h3>
          <p className="hint mb-3">Alegeți persoana din registru pentru fiecare nume, înainte de a completa restul formularului.</p>
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
        selected={selected}
        people={people}
        cancelHref="/procese-verbale"
        onImported={onImported}
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
