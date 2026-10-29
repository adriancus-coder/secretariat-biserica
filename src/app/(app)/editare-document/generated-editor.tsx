"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RichEditor } from "@/components/rich-editor/rich-editor";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { blockToRich, type StoredBlock } from "@/lib/generated-blocks";
import type { GeneratedKind } from "@/lib/generated-kinds";
import { FONT_MAX, FONT_MIN, LINE_HEIGHTS, MARGIN_MAX, MARGIN_MIN, type PageLayout } from "@/lib/page-layout";
import { emptyRich, type RichDoc } from "@/lib/rich-text";
import { resetGeneratedAction, saveGeneratedAction } from "@/server/actions/generated";

/*
 * GENERATED-EDIT: the editor of a generated document. Each block of the document is a field: titles
 * and lines as text, paragraphs and lists in the shared rich editor (a paragraph becomes rich only once
 * changed), tables with editable cells and rows; signatures, charts and pictures come from the data and
 * are only named. The PDF preview sits beside the editor from 1024 px, and behind „Previzualizare” on
 * smaller screens.
 */

interface Item {
  key: number;
  block: StoredBlock;
  /** The rich editor's starting document as JSON: the block turns rich only when the text differs. */
  start?: string;
}

const WIDE = "(min-width: 1024px)";
const PREVIEW_ROUTE = "/pdf/editare-document/previzualizare";

const TYPE_LABEL: Partial<Record<StoredBlock["type"], string>> = { title: "Titlu", nr: "Număr", centered: "Rând centrat" };

export function GeneratedEditor({
  kind,
  query,
  initial,
  labels,
  layout,
  defaultLayout,
  hasSaved,
  readOnly,
  canSave,
  official,
}: {
  kind: GeneratedKind;
  /** The source's parameters (id, an, filters…). */
  query: string;
  initial: StoredBlock[];
  /** "type:nth" → the name of a block that comes from the data. */
  labels: Record<string, string>;
  layout: PageLayout | null;
  defaultLayout: PageLayout;
  hasSaved: boolean;
  readOnly: boolean;
  canSave: boolean;
  official: boolean;
}) {
  const nextKey = useRef(initial.length);
  const [items, setItems] = useState<Item[]>(() => initial.map((block, key) => ({ key, block, start: rich(block) })));
  const [ownLayout, setOwnLayout] = useState(Boolean(layout));
  const [lay, setLay] = useState<PageLayout>(layout ?? defaultLayout);
  const [mode, setMode] = useState<"editare" | "previzualizare">("editare");
  const [wide, setWide] = useState(false);
  const { state, pending, onSubmit } = useActionForm(saveGeneratedAction.bind(null, kind, query));
  const frameName = `generat-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const form = useRef<HTMLFormElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetState, setResetState] = useState<{ message?: string }>({});

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const blocks = items.map((i) => i.block);
  const json = JSON.stringify(blocks);
  const showPreview = wide || mode === "previzualizare";
  // The preview follows the content a second after the last change (when it is shown).
  useEffect(() => {
    if (!showPreview) return;
    const t = setTimeout(() => previewButton.current && form.current?.requestSubmit(previewButton.current), 900);
    return () => clearTimeout(t);
  }, [json, showPreview, ownLayout, lay]);

  const update = (key: number, block: StoredBlock) => setItems((list) => list.map((i) => (i.key === key ? { ...i, block } : i)));
  const remove = (key: number) => setItems((list) => list.filter((i) => i.key !== key));
  const addAfter = (key: number | null) =>
    setItems((list) => {
      const fresh: Item = { key: nextKey.current++, block: { type: "rich", doc: emptyRich() } };
      if (key === null) return [...list, fresh];
      const i = list.findIndex((x) => x.key === key);
      return [...list.slice(0, i + 1), fresh, ...list.slice(i + 1)];
    });
  const setL = <K extends keyof PageLayout>(k: K, v: PageLayout[K]) => setLay((l) => ({ ...l, [k]: v }));

  async function reset() {
    setResetting(true);
    const r = await resetGeneratedAction(kind, query);
    setResetting(false);
    if (r) setResetState(r);
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="gen-editor" data-mode={mode}>
      <input type="hidden" name="sursa" value={kind} />
      <input type="hidden" name="parametri" value={query} />
      <input type="hidden" name="blocks" value={json} />

      <div className="gen-switch" role="group" aria-label="Mod de lucru" hidden={wide}>
        {(["editare", "previzualizare"] as const).map((m) => (
          <button key={m} type="button" className={`btn${mode === m ? " is-on" : ""}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {mode === m ? "✓ " : ""}
            {m === "editare" ? "Editare" : "Previzualizare"}
          </button>
        ))}
      </div>

      <div className="gen-columns">
        <div className="gen-edit" hidden={!wide && mode !== "editare"}>
          {readOnly ? <p className="hint">Versiunea înregistrată nu se mai modifică aici.</p> : null}
          <fieldset disabled={readOnly} className="gen-blocks">
            {items.map((item) => (
              <div key={item.key} className="card gen-block">
                <BlockEditor item={item} label={item.block.type === "fixed" ? labels[`${item.block.of}:${item.block.nth}`] : undefined} onChange={(b) => update(item.key, b)} />
                <div className="gen-block-actions">
                  <button type="button" className="btn btn-sm" onClick={() => addAfter(item.key)}>
                    + Paragraf după
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(item.key)}>
                    Șterge blocul
                  </button>
                </div>
              </div>
            ))}
            {!items.length ? (
              <button type="button" className="btn" onClick={() => addAfter(null)}>
                + Paragraf
              </button>
            ) : null}
          </fieldset>

          <fieldset className="card" disabled={readOnly}>
            <legend className="font-semibold">Așezare în pagină</legend>
            <label className="check !border-0">
              <input type="checkbox" name="asezareProprie" checked={ownLayout} onChange={(e) => setOwnLayout(e.target.checked)} />
              Așezare proprie (altfel, cea obișnuită a acestui document)
            </label>
            <div hidden={!ownLayout}>
              <div className="row2">
                <label>
                  Format
                  <select name="format" value={lay.format} onChange={(e) => setL("format", e.target.value as PageLayout["format"])}>
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                  </select>
                </label>
                <label>
                  Mărimea textului (pt)
                  <input type="number" name="fontSize" min={FONT_MIN} max={FONT_MAX} step={0.5} value={lay.fontSize} onChange={(e) => setL("fontSize", Number(e.target.value))} />
                </label>
              </div>
              <div className="row2">
                {(
                  [
                    ["marginTop", "Marginea de sus (mm)"],
                    ["marginBottom", "Marginea de jos (mm)"],
                    ["marginLeft", "Marginea din stânga (mm)"],
                    ["marginRight", "Marginea din dreapta (mm)"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k}>
                    {l}
                    <input type="number" name={k} min={MARGIN_MIN} max={MARGIN_MAX} value={lay[k]} onChange={(e) => setL(k, Number(e.target.value))} />
                  </label>
                ))}
              </div>
              <div className="row2">
                <label>
                  Spațiere între rânduri
                  <select name="lineHeight" value={String(lay.lineHeight)} onChange={(e) => setL("lineHeight", Number(e.target.value))}>
                    {LINE_HEIGHTS.map((h) => (
                      <option key={h} value={String(h)}>
                        {String(h).replace(".", ",")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Aliniere
                  <select name="align" value={lay.align} onChange={(e) => setL("align", e.target.value as PageLayout["align"])}>
                    <option value="justify">stânga-dreapta</option>
                    <option value="left">la stânga</option>
                  </select>
                </label>
              </div>
              <label className="check !border-0">
                <input type="checkbox" name="letterhead" checked={lay.letterhead} onChange={(e) => setL("letterhead", e.target.checked)} />
                Antetul bisericii
              </label>
            </div>
          </fieldset>
        </div>

        <div className="gen-preview" hidden={!showPreview}>
          {showPreview ? <iframe name={frameName} title="Previzualizare PDF" className="preview-frame" /> : null}
          <button type="submit" className="btn btn-sm mt-2" formAction={PREVIEW_ROUTE} formMethod="post" formTarget="_blank" formNoValidate data-native-submit="">
            Deschide previzualizarea în filă nouă
          </button>
        </div>
      </div>

      {/* Refreshes the preview frame (hidden; the frame follows the content). */}
      <button ref={previewButton} type="submit" hidden formAction={PREVIEW_ROUTE} formMethod="post" formTarget={frameName} formNoValidate data-native-submit="" tabIndex={-1} aria-hidden="true">
        Previzualizează
      </button>

      <FormMessage state={state} />
      {state.errors?.blocks ? (
        <p className="field-error" role="alert">
          {state.errors.blocks}
        </p>
      ) : null}
      {resetState.message ? <FormMessage state={resetState} /> : null}

      {!readOnly && canSave ? (
        <div className="actions">
          {hasSaved ? (
            confirmReset ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>Textul editat se pierde. Refaceți din date?</span>
                <button type="button" className="btn" disabled={resetting} onClick={reset}>
                  {resetting ? "Se reface…" : "Da, reface din date"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                  Renunță
                </button>
              </span>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmReset(true)}>
                Reface din date
              </button>
            )
          ) : null}
          <div className="spacer" />
          {official ? (
            <button type="submit" name="scop" value="inregistrare" className="btn" disabled={pending}>
              Înregistrează
            </button>
          ) : null}
          <button type="submit" name="scop" value="salvare" className="btn btn-primary" disabled={pending}>
            {pending ? "Se salvează…" : "✓ Salvează"}
          </button>
        </div>
      ) : !readOnly ? (
        <p className="hint">Puteți previzualiza și tipări textul modificat; salvarea o fac secretariatul și administratorii.</p>
      ) : null}
    </form>
  );
}

const rich = (block: StoredBlock): string | undefined => {
  const doc = blockToRich(block);
  return doc ? JSON.stringify(doc) : undefined;
};

function BlockEditor({ item, label, onChange }: { item: Item; label?: string; onChange: (b: StoredBlock) => void }) {
  const b = item.block;
  const id = `bloc-${item.key}`;
  if (b.type === "fixed") return <p className="hint m-0">{label ?? "Element generat din date"} — se completează din date, nu se editează aici.</p>;
  if (b.type === "title" || b.type === "nr" || b.type === "centered") {
    return (
      <label htmlFor={id} className="m-0">
        {TYPE_LABEL[b.type]}
        <input id={id} value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} />
      </label>
    );
  }
  if (b.type === "table") return <TableEditor block={b} onChange={onChange} />;
  // Paragraphs, lists and rich text: the shared editor; the block becomes rich only once changed.
  const start = item.start ? (JSON.parse(item.start) as RichDoc) : emptyRich();
  return (
    <RichEditor
      initial={start}
      label="Paragraf"
      minRows={2}
      onChange={(doc) => {
        if (JSON.stringify(doc) === item.start && b.type !== "rich") return;
        onChange({ type: "rich", doc, ...(b.type === "rich" && b.marker ? { marker: b.marker } : {}) });
      }}
    />
  );
}

function TableEditor({ block, onChange }: { block: Extract<StoredBlock, { type: "table" }>; onChange: (b: StoredBlock) => void }) {
  const set = (rows: string[][], bold = block.bold) => onChange({ ...block, rows, ...(bold ? { bold } : {}) });
  return (
    <div className="gen-table">
      <p className="hint m-0 mb-1">Tabel: {block.rows.length} rânduri</p>
      <div className="gen-table-scroll">
        <table>
          <thead>
            <tr>
              {block.columns.map((c, ci) => (
                <th key={ci} scope="col">
                  <input aria-label={`Antetul coloanei ${ci + 1}`} value={c} onChange={(e) => onChange({ ...block, columns: block.columns.map((x, i) => (i === ci ? e.target.value : x)) })} />
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Rând</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => (
                  <td key={ci}>
                    <input
                      aria-label={`Rândul ${ri + 1}, ${block.columns[ci] ?? `coloana ${ci + 1}`}`}
                      value={cell}
                      onChange={(e) => set(block.rows.map((row, i) => (i === ri ? row.map((x, j) => (j === ci ? e.target.value : x)) : row)))}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" className="btn btn-sm btn-ghost" aria-label={`Șterge rândul ${ri + 1}`} onClick={() => set(block.rows.filter((_, i) => i !== ri), block.bold?.filter((_, i) => i !== ri))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-sm mt-2" onClick={() => set([...block.rows, block.columns.map(() => "")], block.bold ? [...block.bold, false] : undefined)}>
        + Rând
      </button>
    </div>
  );
}
