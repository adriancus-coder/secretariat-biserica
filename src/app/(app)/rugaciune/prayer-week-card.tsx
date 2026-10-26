"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icon } from "@/components/shell/icons";
import type { FormState } from "@/lib/form-state";
import { cancelPrayerWeekAction, markPrayerWeekAction, prayerCopiedAction } from "@/server/actions/prayer";

/** "Familia săptămânii" with its buttons; the message is copied as shown (the name only). */
export function PrayerWeekCard({ label, nextKey, marked, skipHref, message }: { label: string | null; nextKey: string | null; marked: boolean; skipHref: string | null; message: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  const run = (action: () => Promise<FormState>) => start(async () => setState(await action()));
  const copy = () =>
    start(async () => {
      try {
        await navigator.clipboard.writeText(message);
        setState({ ok: true, message: "Mesajul a fost copiat. Îl puteți lipi în grupul bisericii." });
        await prayerCopiedAction();
      } catch {
        setState({ message: "Mesajul nu a putut fi copiat. Selectați textul de mai sus și copiați-l manual." });
      }
    });

  if (!label) {
    return (
      <section className="card">
        <h3>Familia săptămânii</h3>
        <p className="hint">Nu există nicio familie în rotație.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-live="polite">
      <h3>Familia săptămânii</h3>
      <p className="prayer-family">{label}</p>
      {marked ? (
        <p className="hint !mt-1">
          <Icon name="bifa" className="inline size-[16px] align-[-3px]" /> Anunțată săptămâna aceasta.
        </p>
      ) : null}
      <label htmlFor="prayer-message" className="block font-medium mt-3 mb-1">
        Mesajul pentru grup
      </label>
      <textarea id="prayer-message" readOnly value={message} rows={3} className="w-full" />
      {state.message ? (
        <div className={`alert mt-3 ${state.ok ? "alert-ok" : ""}`} role="status">
          {state.message}
        </div>
      ) : null}
      <div className="actions">
        {marked ? (
          <button type="button" className="btn" disabled={pending} onClick={() => run(cancelPrayerWeekAction)}>
            Anulează marcarea
          </button>
        ) : nextKey ? (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => markPrayerWeekAction(nextKey))}>
            <Icon name="bifa" className="size-[18px]" /> Marchează ca anunțată
          </button>
        ) : null}
        <button type="button" className="btn" disabled={pending} onClick={copy}>
          Copiază mesajul
        </button>
        {!marked && skipHref ? (
          <Link href={skipHref} className="btn">
            Sari peste
          </Link>
        ) : null}
      </div>
    </section>
  );
}
