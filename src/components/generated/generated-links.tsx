"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/ui/form-bits";
import type { FormState } from "@/lib/form-state";
import { GENERATED, generatedEditorUrl, type GeneratedKind } from "@/lib/generated-kinds";
import { resetGeneratedAction } from "@/server/actions/generated";

/** The source's parameters with the page's table sort (the kinds that print a sorted table). */
function withSort(kind: GeneratedKind, params: Record<string, string | undefined>, sp: URLSearchParams): URLSearchParams {
  const q = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v ? [[k, v]] : [])));
  for (const k of ["sort", "dir"]) if (GENERATED[kind].params.includes(k) && sp.get(k)) q.set(k, sp.get(k)!);
  return q;
}

/** GENERATED-EDIT: „Previzualizează și editează” (the former „Tipărește (PDF)”), with the page's sort. */
export function GeneratedEditLink({ kind, params, className = "btn", children = "Previzualizează și editează" }: { kind: GeneratedKind; params: Record<string, string | undefined>; className?: string; children?: React.ReactNode }) {
  const sp = useSearchParams();
  return (
    <Link href={generatedEditorUrl(kind, withSort(kind, params, sp))} className={className}>
      {children}
    </Link>
  );
}

/** „Reface din date” on the source page: asked in the app first; the edited version is deleted. */
export function ResetGeneratedButton({ kind, query }: { kind: GeneratedKind; query: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<FormState>();
  if (!asking)
    return (
      <button type="button" className="link-inline" onClick={() => setAsking(true)}>
        Reface din date
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2 mt-1">
      <span>Textul editat se pierde. Refaceți din date?</span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setState(await resetGeneratedAction(kind, query, "sursa"));
          setBusy(false);
        }}
      >
        {busy ? "Se reface…" : "Da, reface din date"}
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(false)}>
        Renunță
      </button>
      {state && !state.ok ? <FormMessage state={state} /> : null}
    </span>
  );
}
