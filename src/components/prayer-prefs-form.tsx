"use client";

import { Icon } from "@/components/shell/icons";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { PRAYER_CHILDREN_HELP, PRAYER_CHILDREN_LABEL } from "@/lib/prayer";
import { setPrayerPrefsAction } from "@/server/actions/prayer";

/**
 * "Rugăciunea săptămânală" on the family page (or the person page, for a person without a family):
 * the objection, the children's consent and where the answer came from. Write roles.
 */
export function PrayerPrefsForm({
  target,
  optOut,
  includeChildren,
  source,
  changed,
}: {
  target: { familyId?: string; personId?: string };
  optOut: boolean;
  includeChildren: boolean;
  source: string | null;
  /** "12.10.2026, 10:30 · formular pe hârtie", when it was ever changed. */
  changed: string | null;
}) {
  const { state, pending, onSubmit } = useActionForm(setPrayerPrefsAction.bind(null, target));
  const v = state.values;
  return (
    <form onSubmit={onSubmit} noValidate>
      <FormMessage state={state} />
      <p className="hint !mt-0 mb-3">
        Persoana desemnată de comitet anunță săptămânal pe grupul bisericii familia pentru care ne rugăm: numele familiei și prenumele
        părinților.
      </p>
      <label className="switch-row">
        <input type="checkbox" role="switch" name="prayerOptOut" defaultChecked={v ? v.prayerOptOut === "on" : optOut} />
        <span className="font-medium">Nu doresc să fie pomenită la rugăciunea săptămânală</span>
      </label>
      <label className="switch-row">
        <input type="checkbox" role="switch" name="prayerIncludeChildren" defaultChecked={v ? v.prayerIncludeChildren === "on" : includeChildren} />
        <span>
          <span className="block font-medium">{PRAYER_CHILDREN_LABEL}</span>
          <span className="hint block !mt-0">{PRAYER_CHILDREN_HELP}</span>
        </span>
      </label>
      <div className="field">
        <label htmlFor={`prayer-source-${target.familyId ?? target.personId}`}>Sursa răspunsului</label>
        <select id={`prayer-source-${target.familyId ?? target.personId}`} name="prayerSource" defaultValue={v?.prayerSource ?? (source === "HARTIE" ? "HARTIE" : "SECRETARIAT")}>
          <option value="HARTIE">Formular pe hârtie</option>
          <option value="SECRETARIAT">Secretariat (spus personal)</option>
        </select>
        {state.errors?.prayerSource ? (
          <div className="field-error" role="alert">
            {state.errors.prayerSource}
          </div>
        ) : null}
      </div>
      {changed ? <p className="hint">Ultima modificare: {changed}.</p> : null}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          <Icon name="bifa" className="size-[18px]" /> Salvează alegerea
        </button>
      </div>
    </form>
  );
}
