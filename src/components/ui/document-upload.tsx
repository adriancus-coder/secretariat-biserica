"use client";

import { Icon } from "@/components/shell/icons";

/** File field + "Citește documentul" for the AI extraction forms (PDF, JPG, PNG; up to 20 MB). */
export function DocumentUploadFields({ pending, hint }: { pending: boolean; hint: string }) {
  return (
    <>
      <div className="field">
        <label htmlFor="fisier">Document (PDF, JPG sau PNG, cel mult 20 MB)</label>
        <input id="fisier" name="fisier" type="file" accept="application/pdf,image/jpeg,image/png" required />
        <div className="hint">{hint}</div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        <Icon name="documente" className="size-[18px]" />
        {pending ? "Se citește documentul…" : "Citește documentul"}
      </button>
      {pending ? <p className="hint mt-2">Citirea poate dura până la jumătate de minut.</p> : null}
    </>
  );
}
