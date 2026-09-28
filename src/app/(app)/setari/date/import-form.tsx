"use client";

import { useActionState, useState } from "react";
import { importDataAction, type ImportState } from "@/server/actions/settings";

export function ImportForm() {
  const [state, action, pending] = useActionState(importDataAction, {} as ImportState);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="fisier">Fișier JSON</label>
        <input id="fisier" name="fisier" type="file" accept="application/json,.json" required />
      </div>
      <fieldset className="field">
        <legend className="text-[13px] text-ink-2 font-medium mb-1">Mod</legend>
        <label className="check !border-0 !py-1">
          <input type="radio" name="mod" value="merge" checked={mode === "merge"} onChange={() => setMode("merge")} />
          <span>
            Îmbină — adaugă înregistrările noi și actualizează înregistrările cu același identificator
          </span>
        </label>
        <label className="check !border-0 !py-1">
          <input type="radio" name="mod" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} />
          <span>Înlocuiește — șterge toate datele actuale ale bisericii și le înlocuiește cu cele din fișier</span>
        </label>
      </fieldset>
      {mode === "replace" ? (
        <label className="check !border-0 alert">
          <input type="checkbox" name="confirmare" />
          <span>Confirm ștergerea tuturor datelor actuale (persoane, ședințe, evenimente, documente, grupuri, mențiuni).</span>
        </label>
      ) : null}
      {state.message ? (
        <div className={`alert ${state.ok ? "alert-ok" : ""}`} role={state.ok ? "status" : "alert"}>
          {state.message}
          {state.details?.length ? (
            <ul className="mt-2 list-disc pl-5 text-[13px]">
              {state.details.slice(0, 20).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
              {state.details.length > 20 ? <li>… și încă {state.details.length - 20}</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
      <button type="submit" className={`btn ${mode === "replace" ? "btn-danger" : "btn-primary"}`} disabled={pending}>
        {pending ? "Se importă…" : "Importă"}
      </button>
    </form>
  );
}
