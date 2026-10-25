"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { saveExcusedAction } from "@/server/actions/committee";

/** "Absențe motivate" of a committee meeting: an excused absence does not count towards 5 in a row (Statut art. 45). */
export function ExcusedForm({ meetingId, absent }: { meetingId: string; absent: { id: string; name: string; motivat: boolean }[] }) {
  const [state, action, pending] = useActionState(saveExcusedAction.bind(null, meetingId), initialFormState);
  return (
    <details className="card">
      <summary className="font-semibold cursor-pointer min-h-11 flex items-center">Absențe motivate</summary>
      <form action={action} className="mt-2">
        <p className="hint !mt-0 mb-2">Bifați absențele motivate. Cinci absențe nemotivate la rând sunt semnalate administratorului (Statut art. 45).</p>
        <div className="scroll-panel">
          {absent.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" name={`motivat:${p.id}`} defaultChecked={p.motivat} />
              {p.name}
            </label>
          ))}
        </div>
        <FormMessage state={state} />
        <div className="actions">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Se salvează…" : "Salvează absențele motivate"}
          </button>
        </div>
      </form>
    </details>
  );
}
