"use client";

import { useActionState } from "react";
import { DeleteButton } from "@/components/ui/delete-button";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { STATUTE, STATUTE_KINDS, type StatuteKind } from "@/lib/statutes";
import { deleteStatuteAction, uploadStatuteAction } from "@/server/actions/statutes";

export interface StatuteRow {
  kind: StatuteKind;
  fileName: string;
  /** "245 KB · încărcat la 25.10.2026" */
  details: string;
}

/** Setări → Organizația: the statutes shown on the application form, with their consent checkboxes. */
export function StatutesCard({ slug, statutes, readOnly }: { slug: string; statutes: StatuteRow[]; readOnly: boolean }) {
  return (
    <div className="card mt-7">
      <h3 id="statute">Statute (pentru cererea de membru)</h3>
      <p className="hint mb-3">
        Fiecare statut încărcat apare în formularul public de cerere, cu o bifă „Am citit și sunt de acord”. PDF, cel mult 10 MB.
      </p>
      {STATUTE_KINDS.map((kind) => (
        <StatuteBlock key={kind} kind={kind} slug={slug} row={statutes.find((s) => s.kind === kind)} readOnly={readOnly} />
      ))}
    </div>
  );
}

function StatuteBlock({ kind, slug, row, readOnly }: { kind: StatuteKind; slug: string; row?: StatuteRow; readOnly: boolean }) {
  const [state, action, pending] = useActionState(uploadStatuteAction.bind(null, kind), initialFormState);
  const s = STATUTE[kind];
  return (
    <fieldset className="subfields pb-3">
      <legend>{s.label}</legend>
      {row ? (
        <p className="mb-2 break-all">
          <a href={`/cerere/${slug}/statut/${s.slug}`} target="_blank" rel="noopener">
            {row.fileName}
          </a>
          <span className="block text-xs text-ink-3">{row.details}</span>
        </p>
      ) : (
        <p className="hint mb-2">Neîncărcat.</p>
      )}
      {readOnly ? null : (
        <div className="actions !pt-0 !mt-0">
          <form action={action} className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <input name="fisier" type="file" accept="application/pdf" required aria-label={`Fișierul PDF: ${s.label}`} className="max-w-full" />
            <button type="submit" className="btn" disabled={pending}>
              {pending ? "Se încarcă…" : row ? "Înlocuiește" : "Încarcă"}
            </button>
          </form>
          {row ? <DeleteButton action={deleteStatuteAction.bind(null, kind)} confirmMessage={`Ștergeți ${s.label.toLowerCase()}?`} /> : null}
        </div>
      )}
      <FormMessage state={state} />
    </fieldset>
  );
}
