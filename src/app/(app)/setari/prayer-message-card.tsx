"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/shell/icons";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import type { PrayerUnit } from "@/lib/prayer";
import { DEFAULT_FAMILY_MESSAGE, DEFAULT_PERSON_MESSAGE, MESSAGE_TEMPLATE_MAX, prayerMessageFor, templateError } from "@/lib/prayer-message";
import { savePrayerMessageAction } from "@/server/actions/prayer";

type Kind = "family" | "person";

/**
 * Setări → "Rugăciunea săptămânală": the two messages copied or sent from /rugaciune, with a live
 * preview on a family and a person of the church (administrators; the samples come only to them).
 */
export function PrayerMessageCard({
  family,
  person,
  readOnly,
  samples,
  today,
}: {
  family: string;
  person: string;
  readOnly: boolean;
  samples: { family: PrayerUnit | null; person: PrayerUnit | null };
  today: string;
}) {
  const { state, pending, onSubmit } = useActionForm(savePrayerMessageAction);
  const [draft, setDraft] = useState<Record<Kind, string>>({ family, person });
  const templates = { family: draft.family, person: draft.person };
  const field = (kind: Kind, name: string, label: string, help: string, placeholder: string) => {
    // The same check as on the server, shown while typing.
    const problem = state.errors?.[name] ?? templateError(draft[kind], kind);
    const sample = samples[kind];
    return (
      <div className="field">
        <label htmlFor={name}>{label}</label>
        <textarea
          id={name}
          name={name}
          rows={4}
          maxLength={MESSAGE_TEMPLATE_MAX}
          placeholder={placeholder}
          value={draft[kind]}
          onChange={(e) => setDraft((d) => ({ ...d, [kind]: e.target.value }))}
          aria-describedby={`${name}-help`}
        />
        <div id={`${name}-help`} className="hint">
          {help}
        </div>
        {problem ? (
          <div className="field-error" role="alert">
            {problem}
          </div>
        ) : null}
        {sample ? (
          <>
            <p className="hint mb-1">Previzualizare:</p>
            <p className="prayer-preview">{prayerMessageFor(sample, today, templates)}</p>
          </>
        ) : null}
      </div>
    );
  };
  return (
    <form onSubmit={onSubmit} noValidate className="card mt-7" id="rugaciune">
      <h3>Rugăciunea săptămânală</h3>
      <p className="hint mb-3">
        Mesajele propuse pe pagina <Link href="/rugaciune">Rugăciune</Link> pentru grupul bisericii (se pot modifica înainte de trimitere). Goale,
        se folosesc textele implicite.
      </p>
      <FormMessage state={state} />
      <fieldset disabled={readOnly}>
        {field(
          "family",
          "prayerMessage",
          "Mesajul pentru familii",
          "{parinti} = numele părinților; {copii} = „ și pentru micuțul Samuel” (cu acordul părinților) sau „ și pentru copiii lor”; {familia} = forma scurtă, ca înainte.",
          DEFAULT_FAMILY_MESSAGE,
        )}
        {field("person", "prayerMessagePerson", "Mesajul pentru o persoană fără familie", "{persoana} = „fratele …” / „sora …”; {pe} = „să-l” / „s-o”; {ii} = „să-i”.", DEFAULT_PERSON_MESSAGE)}
        {!readOnly ? (
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              <Icon name="bifa" className="size-[18px]" /> Salvează mesajele
            </button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
