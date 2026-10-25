"use client";

import type { ReactNode } from "react";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { decideSubmissionAction } from "@/server/actions/review";

/** The decision form: the checkboxes rendered by the page, then accept all / accept selected / reject. */
export function ReviewForm({ id, children, readOnly = false }: { id: string; children: ReactNode; readOnly?: boolean }) {
  const { state, pending, onSubmit } = useActionForm(decideSubmissionAction.bind(null, id));
  if (readOnly) return <>{children}</>;
  return (
    <form onSubmit={onSubmit} noValidate>
      {children}
      <div className="card">
        <label htmlFor="nota" className="block font-medium mb-1">
          Notă (la respingere sau pentru jurnal)
        </label>
        <textarea id="nota" name="nota" rows={2} maxLength={1000} />
        <FormMessage state={state} />
        <div className="actions flex-wrap">
          <button type="submit" name="decizie" value="respinge" className="btn" disabled={pending}>
            Respinge
          </button>
          <div className="spacer" />
          <button type="submit" name="decizie" value="selectate" className="btn" disabled={pending}>
            Acceptă cele bifate
          </button>
          <button type="submit" name="decizie" value="toate" className="btn btn-primary" disabled={pending}>
            Acceptă tot
          </button>
        </div>
      </div>
    </form>
  );
}
