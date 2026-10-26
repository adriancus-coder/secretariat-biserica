"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/shell/icons";
import { Field } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import {
  DEFAULT_LAYOUT,
  FONT_MAX,
  FONT_MIN,
  LINE_HEIGHTS,
  MARGIN_MAX,
  MARGIN_MIN,
  layoutQuery,
  layoutSummary,
  type PageLayout,
} from "@/lib/page-layout";
import type { FormState } from "@/lib/form-state";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MARGINS = [
  ["marginTop", "Sus"],
  ["marginBottom", "Jos"],
  ["marginLeft", "Stânga"],
  ["marginRight", "Dreapta"],
] as const;

/** What the page lays out: the minutes or a registered document (the texts differ). */
export interface LayoutSubject {
  /** The PDF route of the record ("/pdf/proces-verbal/<id>"); its "/word" sibling gives the Word file. */
  pdfBase: string;
  /** "acest proces-verbal" / "acest document". */
  name: string;
  /** "procesele-verbale" / "documentele" (for the default). */
  plural: string;
  lockedNote?: string;
}

/**
 * "Așezare în pagină" (format, margins, text size, line spacing, alignment, letterhead) with a live
 * PDF preview; shared by the minutes and the registered documents.
 */
export function LayoutEditor({
  subject,
  action,
  initial,
  churchDefault,
  hasOwn,
  locked,
  canSetDefault,
}: {
  subject: LayoutSubject;
  /** The save action, bound to the record; the pressed button's `scop` is "pv" (own), "implicit" (admin) or "resetare". */
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: PageLayout;
  churchDefault: PageLayout;
  /** The record has its own layout (else it follows the church's default). */
  hasOwn: boolean;
  locked: boolean;
  canSetDefault: boolean;
}) {
  const [layout, setLayout] = useState<PageLayout>(initial);
  const { state, pending, onSubmit } = useActionForm(action);
  const e = state.errors ?? {};
  const set = <K extends keyof PageLayout>(k: K, v: PageLayout[K]) => setLayout((l) => ({ ...l, [k]: v }));
  const valid =
    [layout.marginTop, layout.marginBottom, layout.marginLeft, layout.marginRight].every((n) => n >= MARGIN_MIN && n <= MARGIN_MAX) &&
    layout.fontSize >= FONT_MIN &&
    layout.fontSize <= FONT_MAX;

  // The preview follows the form, a moment after the last change.
  const query = layoutQuery(layout);
  const [previewQuery, setPreviewQuery] = useState(query);
  useEffect(() => {
    if (!valid) return;
    const t = setTimeout(() => setPreviewQuery(query), 700);
    return () => clearTimeout(t);
  }, [query, valid]);
  const previewUrl = `${subject.pdfBase}?previzualizare=1&${previewQuery}`;

  return (
    <div className="layout-editor">
      <form onSubmit={onSubmit} noValidate className="card">
        <FormMessage state={state} />
        {locked && subject.lockedNote ? (
          <div className="alert mb-3" role="status">
            {subject.lockedNote}
          </div>
        ) : null}
        <p className="hint !mt-0 mb-3">
          {hasOwn ? `${cap(subject.name)} are o așezare proprie.` : `${cap(subject.name)} folosește așezarea implicită a bisericii pentru ${subject.plural}.`}
        </p>

        <fieldset className="choices mb-3">
          <legend>Format</legend>
          {(["A4", "A5"] as const).map((f) => (
            <label key={f} className="choice">
              <input type="radio" name="format" value={f} checked={layout.format === f} onChange={() => set("format", f)} />
              <span className="tick" aria-hidden="true">
                <Icon name="bifa" className="size-[14px]" />
              </span>
              {f}
            </label>
          ))}
        </fieldset>

        <fieldset className="mb-1">
          <legend className="font-medium mb-1">Margini (mm)</legend>
          <div className="row2">
            {MARGINS.map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`f-${k}`} error={e[k]}>
                <input
                  id={`f-${k}`}
                  name={k}
                  type="number"
                  inputMode="numeric"
                  min={MARGIN_MIN}
                  max={MARGIN_MAX}
                  value={Number.isNaN(layout[k]) ? "" : layout[k]}
                  onChange={(ev) => set(k, ev.target.valueAsNumber)}
                />
              </Field>
            ))}
          </div>
        </fieldset>

        <div className="row2 stack-sm">
          <Field label={`Mărimea textului (${FONT_MIN}–${FONT_MAX} pt)`} htmlFor="f-fontSize" error={e.fontSize}>
            <input
              id="f-fontSize"
              name="fontSize"
              type="number"
              inputMode="decimal"
              step={0.5}
              min={FONT_MIN}
              max={FONT_MAX}
              value={Number.isNaN(layout.fontSize) ? "" : layout.fontSize}
              onChange={(ev) => set("fontSize", ev.target.valueAsNumber)}
            />
          </Field>
          <Field label="Spațiere între rânduri" htmlFor="f-lineHeight" error={e.lineHeight}>
            <select id="f-lineHeight" name="lineHeight" value={layout.lineHeight} onChange={(ev) => set("lineHeight", Number(ev.target.value))}>
              {LINE_HEIGHTS.map((h) => (
                <option key={h} value={h}>
                  {String(h).replace(".", ",")}
                  {h === DEFAULT_LAYOUT.lineHeight ? " (obișnuită)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="choices mb-3">
          <legend>Aliniere</legend>
          {(
            [
              ["justify", "Stânga-dreapta"],
              ["left", "La stânga"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="choice">
              <input type="radio" name="align" value={v} checked={layout.align === v} onChange={() => set("align", v)} />
              <span className="tick" aria-hidden="true">
                <Icon name="bifa" className="size-[14px]" />
              </span>
              {label}
            </label>
          ))}
        </fieldset>

        <label className="switch-row">
          <input type="checkbox" role="switch" name="letterhead" checked={layout.letterhead} onChange={(ev) => set("letterhead", ev.target.checked)} />
          <span>
            <span className="block font-medium">Tipărește antetul bisericii</span>
            <span className="hint block !mt-0">Opriți-l pentru hârtie cu antet tipărit; măriți atunci marginea de sus.</span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2 mt-2">
          <button type="button" className="btn" onClick={() => setLayout(churchDefault)}>
            Valorile implicite ale bisericii
          </button>
          <button type="button" className="btn" onClick={() => setLayout(DEFAULT_LAYOUT)}>
            Așezarea inițială
          </button>
        </div>

        <div className="actions">
          <button type="submit" name="scop" value="pv" className="btn btn-primary" disabled={pending || locked}>
            <Icon name="bifa" className="size-[18px]" /> Salvează pentru {subject.name}
          </button>
          {canSetDefault ? (
            <button type="submit" name="scop" value="implicit" className="btn" disabled={pending}>
              Salvează ca implicită
            </button>
          ) : null}
          {hasOwn ? (
            <button type="submit" name="scop" value="resetare" className="btn" disabled={pending || locked}>
              Revino la așezarea implicită
            </button>
          ) : null}
        </div>
        <p className="hint mt-2">Acum: {valid ? layoutSummary(layout) : "valori în afara limitelor"}</p>
      </form>

      <div className="layout-preview">
        <div className="flex flex-wrap gap-2 mb-2">
          <a className="btn" href={previewUrl} target="_blank" rel="noopener">
            Previzualizează (PDF)
          </a>
          <a className="btn" href={`${subject.pdfBase}/word?previzualizare=1&${previewQuery}`} download>
            Deschide în Word
          </a>
        </div>
        {/* Phones show PDFs poorly inside a page: the button above opens the preview instead. */}
        <iframe key={previewQuery} src={previewUrl} title="Previzualizare PDF" className="layout-frame" />
      </div>
    </div>
  );
}
