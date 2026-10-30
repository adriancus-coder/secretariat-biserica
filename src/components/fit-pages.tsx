"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { pagesLabel } from "@/lib/fit-layout";
import { pageLayoutSchema, pageLayoutInput, type PageLayout } from "@/lib/page-layout";
import { fitPagesAction, pageInfoAction, restoreLayoutAction, type FitState } from "@/server/actions/fit-pages";

/**
 * FIT-TO-PAGE beside a preview: the page count („3 pagini”, refreshed a moment after every change),
 * „Potrivește pe mai puține pagini”, the warning when the last page is nearly empty, and after a fit
 * „Rearanjat: 4 → 3 pagini” with „Revino la așezarea obișnuită”. `build` gives the form as it is now
 * (what is laid out and the layout shown); `onLayout` puts a layout back into the form (null: the usual one).
 */
export function FitPages({
  build,
  watch,
  hadOwn,
  onLayout,
}: {
  build: () => FormData;
  /** Changes when the content or the layout changes (the count is taken again). */
  watch: string;
  /** The layout shown is the record's own (a revert saves it back; else the usual one returns). */
  hadOwn: boolean;
  onLayout: (layout: PageLayout | null, saved: boolean) => void;
}) {
  const [pages, setPages] = useState<number | null>(null);
  const [sparse, setSparse] = useState(false);
  const [result, setResult] = useState<FitState | null>(null);
  const [canRevert, setCanRevert] = useState(false);
  const [pending, start] = useTransition();
  const before = useRef<{ form: FormData; own: boolean } | null>(null);
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  });

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await pageInfoAction(buildRef.current());
      if (!live) return;
      if (r.pages) {
        setPages(r.pages);
        setSparse(Boolean(r.sparse));
      }
    }, 900);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [watch]);

  const fit = () =>
    start(async () => {
      const form = buildRef.current();
      const r = await fitPagesAction(form);
      if (r.ok && r.layout) {
        before.current = { form, own: hadOwn };
        setCanRevert(Boolean(r.saved));
        onLayout(r.layout, Boolean(r.saved));
      }
      setResult(r);
    });

  const revert = () =>
    start(async () => {
      const b = before.current;
      if (!b) return;
      b.form.set("inapoi", b.own ? "1" : "");
      const r = await restoreLayoutAction(b.form);
      if (r.ok) {
        const previous = b.own ? pageLayoutSchema.safeParse(pageLayoutInput(b.form)) : null;
        onLayout(previous?.success ? previous.data : null, true);
        before.current = null;
        setCanRevert(false);
        setResult(null);
      } else setResult(r);
    });

  const warn = sparse && !result?.ok;
  const button = (
    <button type="button" className="btn btn-sm" disabled={pending} onClick={fit}>
      {pending ? "Se rearanjează…" : "Potrivește pe mai puține pagini"}
    </button>
  );

  return (
    <div className="fit-pages">
      <div className="fit-pages-bar">
        <span className="tag" aria-live="polite">
          {pages ? pagesLabel(pages) : "Se numără paginile…"}
        </span>
        {warn ? null : button}
      </div>
      {warn ? (
        <div className="alert mt-2" role="status">
          <p className="!mt-0">Ultima pagină are foarte puțin conținut. Potrivește pe mai puține pagini?</p>
          <div className="mt-2">{button}</div>
        </div>
      ) : null}
      {result?.message ? (
        <div className={`alert mt-2${result.ok ? " alert-ok" : ""}`} role="status">
          {result.message}
          {result.ok && canRevert ? (
            <div className="mt-2">
              <button type="button" className="btn btn-sm" disabled={pending} onClick={revert}>
                Revino la așezarea obișnuită
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
