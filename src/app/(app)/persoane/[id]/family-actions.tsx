"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { initialFormState } from "@/lib/form-state";
import { normalizeSearch } from "@/lib/text";
import { headNewFamilyAction, joinFamilyAction } from "@/server/actions/families";

/** A person without a family: "Fă cap de familie nouă" (adults only) and "Adaugă la familia…". */
export function NoFamilyActions({
  personId,
  canHead,
  families,
  rudenie,
}: {
  personId: string;
  canHead: boolean;
  families: { id: string; label: string }[];
  rudenie: string[];
}) {
  const [headState, head, heading] = useActionState(async () => headNewFamilyAction(personId), initialFormState);
  const { state, pending, onSubmit } = useActionForm(joinFamilyAction.bind(null, personId));
  const [q, setQ] = useState("");
  const key = normalizeSearch(q);
  const shown = families.filter((f) => !key || normalizeSearch(f.label).includes(key));

  return (
    <div className="grid gap-3">
      {canHead ? (
        <form action={head}>
          <button type="submit" className="btn" disabled={heading}>
            {heading ? "Se creează…" : "Fă cap de familie nouă"}
          </button>
          <FormMessage state={headState} />
        </form>
      ) : (
        <p className="hint">Un copil sau o persoană sub 18 ani nu poate fi cap de familie; adăugați-o la familia părinților.</p>
      )}
      {families.length ? (
        <form onSubmit={onSubmit} noValidate className="grid gap-2">
          <label htmlFor="join-q" className="text-sm font-medium text-ink-2">
            Adaugă la familia…
          </label>
          <input id="join-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după numele capului familiei" />
          <select name="familyId" aria-label="Familia" defaultValue="" required>
            <option value="" disabled>
              {shown.length ? "Alegeți familia" : "Nicio familie găsită"}
            </option>
            {shown.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select name="rudenie" aria-label="Gradul de rudenie" defaultValue="">
            <option value="">Gradul de rudenie —</option>
            {rudenie.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <FormMessage state={state} />
          <div>
            <button type="submit" className="btn" disabled={pending}>
              {pending ? "Se adaugă…" : "Adaugă la familie"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
