"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/lib/form-state";
import { checkKinLinksAction } from "@/server/actions/kinship";

/** "Verifică legăturile de rudenie" (administrators): repairs and completes the links from the families; counts only. */
export function FamilyLinks() {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  return (
    <>
      <p className="hint">
        În fiecare familie, membrii cu rudenia Fiu, Fiică sau Copil devin copiii capului familiei și ai soției / soțului (doar cei cu rudenia Soț / Soție).
        Legăturile din familii care încalcă regulile (frați, diferență de vârstă prea mică) se șterg; cele adăugate manual nu se șterg, ci apar în „De
        verificat”. Se poate rula oricând din nou.
      </p>
      {state.message ? (
        <div className={`alert mt-2 ${state.ok ? "alert-ok" : ""}`} role="status">
          {state.message}
        </div>
      ) : null}
      <button type="button" className="btn mt-2" disabled={pending} onClick={() => start(async () => setState(await checkKinLinksAction()))}>
        Verifică legăturile de rudenie
      </button>
    </>
  );
}
