"use client";

import { useEffect, useRef, useState } from "react";
import { DeleteButton } from "@/components/ui/delete-button";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import type { FormState } from "@/lib/form-state";
import { PASTORAL_NOTE_MAX } from "@/lib/schemas/pastoral-note";
import { DownloadLink } from "@/components/ui/download";
import { MIME } from "@/lib/download";

export interface PastoralNoteItem {
  id: string;
  text: string | null;
  author: string;
  mine: boolean;
  when: string;
}

/** One note form: a new note, or the edit of one's own (the text is cleared after a new note is saved). */
function NoteForm({
  action,
  initial = "",
  label,
  onDone,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial?: string;
  label: string;
  onDone?: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(action);
  useEffect(() => {
    if (!state.ok) return;
    if (!initial) ref.current?.reset();
    onDone?.();
  }, [state, initial, onDone]);
  return (
    <form ref={ref} onSubmit={onSubmit} noValidate className="grid gap-2">
      <div className="field !mb-0">
        <label htmlFor={`nota-${initial ? "edit" : "noua"}`}>{initial ? "Nota" : "Notă nouă"}</label>
        <textarea id={`nota-${initial ? "edit" : "noua"}`} name="text" rows={4} maxLength={PASTORAL_NOTE_MAX} defaultValue={state.values?.text ?? initial} required />
        {state.errors?.text ? <p className="field-error">{state.errors.text}</p> : null}
      </div>
      <FormMessage state={state} />
      <div>
        <button type="submit" className={initial ? "btn" : "btn btn-primary"} disabled={pending}>
          {pending ? "Se salvează…" : label}
        </button>
      </div>
    </form>
  );
}

/**
 * "Note pastorale" (Statut art. 39 alin. 3): every pastor of the church sees them; each changes or
 * deletes only their own. Shown only after the step-up.
 */
export function PastoralNotesCard({
  notes,
  add,
  edit,
  remove,
  exportHref,
}: {
  notes: PastoralNoteItem[];
  add: (prev: FormState, fd: FormData) => Promise<FormState>;
  edit: Record<string, (prev: FormState, fd: FormData) => Promise<FormState>>;
  remove: Record<string, () => Promise<FormState>>;
  exportHref: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="card" id="note-pastorale">
      <h3>Note pastorale</h3>
      <p className="hint">Confidențiale: le văd doar pastorii bisericii. Nu apar în exporturi, căutare sau jurnal; textul este păstrat criptat.</p>
      {notes.length ? (
        <ul className="pastoral-notes">
          {notes.map((n) => (
            <li key={n.id}>
              {editing === n.id && n.mine && n.text !== null ? (
                <NoteForm action={edit[n.id]} initial={n.text} label="Salvează nota" onDone={() => setEditing(null)} />
              ) : (
                <p className="whitespace-pre-wrap m-0">{n.text ?? "Nota nu poate fi citită (cheia de criptare s-a schimbat)."}</p>
              )}
              <div className="hint !mt-1">
                {n.author}, {n.when}
              </div>
              {n.mine ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {editing === n.id ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                      Renunță
                    </button>
                  ) : n.text !== null ? (
                    <button type="button" className="btn" onClick={() => setEditing(n.id)}>
                      Modifică
                    </button>
                  ) : null}
                  <DeleteButton action={remove[n.id]} confirmMessage="Ștergeți definitiv această notă pastorală?" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nicio notă pastorală.</p>
      )}
      <NoteForm action={add} label="Adaugă nota" />
      <div className="mt-3">
        <DownloadLink file={exportHref} filename="note-pastorale.pdf" mime={MIME.pdf} inline personal>
          Exportă notele pastorale (PDF)
        </DownloadLink>
      </div>
    </div>
  );
}
