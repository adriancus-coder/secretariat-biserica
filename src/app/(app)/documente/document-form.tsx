"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { PreviewButton } from "@/components/rich-editor/preview-frame";
import { RichEditor, type RichEditorHandle } from "@/components/rich-editor/rich-editor";
import { Field, SelectField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { DOCUMENT_TYPE_LABEL, DOCUMENT_TYPES, type DocumentTypeKey } from "@/lib/labels";
import { plainToRich, richToPlain, type RichDoc } from "@/lib/rich-text";
import { documentDraftAction, saveDocumentAction } from "@/server/actions/documents";

export interface DocumentFormInitial {
  tip: DocumentTypeKey;
  nr: string;
  data: string;
  personId: string;
  catre: string;
  scop: string;
  titlu: string;
  text: string;
  /** The saved rich text, when the document has one (else built from `text`). */
  textRich?: RichDoc | null;
  anRaport: string;
}

export function DocumentForm({
  id,
  initial,
  people,
  nextNr,
  cancelHref,
}: {
  id: string | null;
  initial: DocumentFormInitial;
  people: { id: string; name: string; exited: boolean }[];
  nextNr: number;
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useActionForm(saveDocumentAction.bind(null, id));
  const e = state.errors ?? {};
  const [tip, setTip] = useState<DocumentTypeKey>(initial.tip);
  const [personId, setPersonId] = useState(initial.personId);
  const [catre, setCatre] = useState(initial.catre);
  const [scop, setScop] = useState(initial.scop);
  const [anRaport, setAnRaport] = useState(initial.anRaport);
  const [titlu, setTitlu] = useState(initial.titlu);
  // The plain text of the editor's content (the template check below and the preview use it).
  const [text, setText] = useState(initial.text);
  const [initialDoc] = useState(() => initial.textRich ?? plainToRich(initial.text));
  const editor = useRef<RichEditorHandle>(null);
  /** Set while the template fills the editor, so that change does not count as a manual edit. */
  const filling = useRef(false);
  // Ca în prototip: textul modificat manual nu se suprascrie automat (doar cu „Regenerează”).
  // La editarea unui document existent, textul salvat e considerat modificat manual.
  const textTouched = useRef(id !== null);
  const titleTouched = useRef(id !== null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const dataRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  /** Destinatarul și scopul folosite la ultima generare (regenerăm la ieșirea din câmp doar dacă s-au schimbat). */
  const used = useRef({ catre: initial.catre, scop: initial.scop });

  async function regenerate(force: boolean, next: Partial<{ tip: DocumentTypeKey; personId: string; catre: string; scop: string; anRaport: string }> = {}) {
    if (!force && text.trim() && textTouched.current) return;
    used.current = { catre: next.catre ?? catre, scop: next.scop ?? scop };
    const current = ++request.current;
    setGenerating(true);
    setGenError(null);
    const res = await documentDraftAction({
      tip: next.tip ?? tip,
      personId: next.personId ?? personId,
      catre: next.catre ?? catre,
      scop: next.scop ?? scop,
      anRaport: next.anRaport ?? anRaport,
      data: dataRef.current?.value ?? initial.data,
    });
    if (current !== request.current) return; // un răspuns mai vechi decât ultima cerere
    setGenerating(false);
    if ("error" in res) {
      setGenError(res.error);
      return;
    }
    setText(res.text);
    filling.current = true;
    editor.current?.setContent(plainToRich(res.text));
    filling.current = false;
    textTouched.current = false;
    if (force || !titleTouched.current) {
      setTitlu(res.titlu);
      titleTouched.current = false;
    }
  }

  const previewHost = `preview-doc-${id ?? "nou"}`;

  return (
    <form onSubmit={onSubmit} noValidate className="edit-split">
      <div className="edit-main">
      {id ? <input type="hidden" name="previewId" value={id} /> : null}
      <div className="row2">
        <SelectField
          name="tip"
          label="Tip"
          value={tip}
          onChange={(ev) => {
            const t = ev.target.value as DocumentTypeKey;
            setTip(t);
            const an = t === "raport" && !anRaport ? (dataRef.current?.value ?? initial.data).slice(0, 4) : anRaport;
            setAnRaport(an);
            void regenerate(false, { tip: t, anRaport: an });
          }}
          options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABEL[t] }))}
          error={e.tip}
        />
        <Field label="Nr. / data" error={e.nr ?? e.data}>
          <div className="flex gap-1.5">
            <input
              name="nr"
              type="number"
              min={1}
              inputMode="numeric"
              defaultValue={initial.nr}
              placeholder={`auto: ${nextNr}`}
              aria-label="Număr de înregistrare"
              aria-invalid={e.nr ? true : undefined}
              className="!w-[104px] shrink-0"
            />
            <input
              ref={dataRef}
              name="data"
              type="date"
              defaultValue={initial.data}
              aria-label="Data documentului"
              aria-invalid={e.data ? true : undefined}
            />
          </div>
        </Field>
      </div>
      <p className="hint -mt-2.5 mb-3">Lăsați numărul gol pentru numerotare automată în registrul anului.</p>

      {tip === "raport" ? (
        <TextField
          name="anRaport"
          label="Anul raportat"
          type="number"
          min={1900}
          max={2200}
          value={anRaport}
          onChange={(ev) => setAnRaport(ev.target.value)}
          onBlur={(ev) => void regenerate(false, { anRaport: ev.target.value })}
          error={e.anRaport}
          className="max-w-[200px]"
        />
      ) : (
        <input type="hidden" name="anRaport" value="" />
      )}

      <SelectField
        name="personId"
        label="Persoana (din registru)"
        value={personId}
        onChange={(ev) => {
          setPersonId(ev.target.value);
          void regenerate(false, { personId: ev.target.value });
        }}
        emptyLabel="— fără —"
        options={people.map((p) => ({ value: p.id, label: p.exited ? `${p.name} (ieșit din evidență)` : p.name }))}
        error={e.personId}
      />
      <div className="row2 stack-sm">
        <TextField
          name="catre"
          label="Către / destinatar"
          placeholder="ex. Biserica Betel Oslo"
          value={catre}
          onChange={(ev) => setCatre(ev.target.value)}
          onBlur={(ev) => ev.target.value !== used.current.catre && void regenerate(false, { catre: ev.target.value })}
          error={e.catre}
        />
        <TextField
          name="scop"
          label="Scop / subiect"
          placeholder="ex. a-i servi la …"
          value={scop}
          onChange={(ev) => setScop(ev.target.value)}
          onBlur={(ev) => ev.target.value !== used.current.scop && void regenerate(false, { scop: ev.target.value })}
          error={e.scop}
        />
      </div>
      <TextField
        name="titlu"
        label="Titlu în registru"
        value={titlu}
        onChange={(ev) => {
          setTitlu(ev.target.value);
          titleTouched.current = true;
        }}
        error={e.titlu}
      />
      <Field
        label={
          <>
            Conținut <span className="hint inline">(generat din datele introduse; poate fi modificat)</span>
          </>
        }
        htmlFor="f-text"
        error={e.text ?? e.textRich ?? genError ?? undefined}
      >
        <input type="hidden" name="text" value={text} />
        <div aria-busy={generating || undefined}>
          <RichEditor
            name="textRich"
            id="f-text"
            label="Conținut"
            initial={initialDoc}
            minRows={14}
            invalid={Boolean(e.text ?? e.textRich)}
            editorRef={editor}
            onChange={(doc) => {
              setText(richToPlain(doc));
              if (!filling.current) textTouched.current = true;
            }}
          />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void regenerate(true)} disabled={generating}>
            Regenerează din șablon
          </button>
          {generating ? <span className="hint !mt-0">Se generează…</span> : null}
        </div>
      </Field>

      <FormMessage state={state} />
      <div className="actions">
        <Link href={cancelHref} className="btn btn-ghost">
          Renunță
        </Link>
        <div className="spacer" />
        <PreviewButton action="/pdf/document/previzualizare" frameHostId={previewHost} />
        <button type="submit" className="btn btn-primary" disabled={pending || generating}>
          {pending ? "Se salvează…" : "Salvează"}
        </button>
      </div>
      </div>
      <aside id={previewHost} className="edit-preview" hidden aria-label="Previzualizare" />
    </form>
  );
}
