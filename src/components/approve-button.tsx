"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/shell/icons";
import type { FormState } from "@/lib/form-state";

/** The pastor's one-click approval of a prepared proposal; on success the action redirects. */
export function ApproveButton({ action, label }: { action: () => Promise<FormState>; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await action();
            if (r && !r.ok) setError(r.message ?? "Aprobarea nu a reușit.");
          })
        }
      >
        <Icon name="bifa" className="size-[18px]" />
        {pending ? "Se salvează…" : label}
      </button>
      {error ? (
        <p className="field-error w-full" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
