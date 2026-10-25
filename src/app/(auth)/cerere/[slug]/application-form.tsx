"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/shell/icons";
import { nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { APPLICATION_KIND_LABEL, APPLICATION_KINDS, GENDER_LABEL, GENDERS, type ApplicationKindKey } from "@/lib/labels";
import { APPLICATION_MESSAGE_MAX } from "@/lib/schemas/application";
import { STATUTE, type StatuteKind } from "@/lib/statutes";
import { submitApplicationAction } from "@/server/actions/applications";

export interface PublishedStatute {
  kind: StatuteKind;
  /** Changes when the statute is replaced, so a new version must be opened again. */
  version: string;
}

const openedKey = (slug: string, s: PublishedStatute) => `statut-deschis:${slug}:${s.kind}:${s.version}`;
const OPENED_EVENT = "statut-deschis";
/** Fallback when sessionStorage is unavailable (private mode): remembered for this page view. */
const openedInMemory = new Set<string>();

function wasOpened(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === "1") return true;
  } catch {
    // no storage
  }
  return openedInMemory.has(key);
}

function rememberOpened(key: string) {
  openedInMemory.add(key);
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // no storage: the in-memory flag is enough for this page view
  }
  window.dispatchEvent(new Event(OPENED_EVENT));
}

function subscribeOpened(onChange: () => void) {
  window.addEventListener(OPENED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPENED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ApplicationForm({ slug, rudenie, statutes }: { slug: string; rudenie: string[]; statutes: PublishedStatute[] }) {
  const { state, pending, onSubmit } = useActionForm(submitApplicationAction.bind(null, slug));
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const [kind, setKind] = useState<ApplicationKindKey | "">((v.kind as ApplicationKindKey) || "");
  const [gdpr, setGdpr] = useState(v.consent === "on");
  // A statute's checkbox is enabled once the statute was opened in this browser session.
  const openedList = useSyncExternalStore(
    subscribeOpened,
    () => statutes.filter((st) => wasOpened(openedKey(slug, st))).map((st) => st.kind).join(","),
    () => "",
  );
  const opened = Object.fromEntries(openedList.split(",").filter(Boolean).map((k) => [k, true])) as Partial<Record<StatuteKind, boolean>>;
  const [agreed, setAgreed] = useState<Partial<Record<StatuteKind, boolean>>>({});
  const markOpened = (st: PublishedStatute) => rememberOpened(openedKey(slug, st));
  const ready = gdpr && statutes.every((s) => agreed[s.kind]);

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="choices" aria-describedby={e.kind ? "f-kind-err" : undefined}>
        <legend>Tipul cererii</legend>
        {APPLICATION_KINDS.map((k) => (
          <label key={k} className="choice">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            <span className="tick" aria-hidden="true">
              <Icon name="bifa" className="size-[14px]" />
            </span>
            {APPLICATION_KIND_LABEL[k]}
          </label>
        ))}
        {e.kind ? (
          <div className="field-error" id="f-kind-err" role="alert">
            {e.kind}
          </div>
        ) : null}
      </fieldset>

      <div className="row2 stack-sm">
        <TextField name="nume" label="Nume" defaultValue={v.nume ?? ""} error={e.nume} autoComplete="family-name" required />
        <TextField name="prenume" label="Prenume" defaultValue={v.prenume ?? ""} error={e.prenume} autoComplete="given-name" required />
      </div>
      <div className="row2 stack-sm">
        <SelectField
          name="gen"
          label="Gen"
          defaultValue={v.gen ?? ""}
          error={e.gen}
          emptyLabel="—"
          options={GENDERS.map((g) => ({ value: g, label: GENDER_LABEL[g] }))}
        />
        <TextField name="dataNasterii" label="Data nașterii" type="date" defaultValue={v.dataNasterii ?? ""} error={e.dataNasterii} />
      </div>
      <div className="row2 stack-sm">
        <TextField name="telefon" label="Telefon" type="tel" defaultValue={v.telefon ?? ""} error={e.telefon} autoComplete="tel" />
        <TextField name="email" label="E-mail" type="email" defaultValue={v.email ?? ""} error={e.email} autoComplete="email" inputMode="email" />
      </div>
      <TextField name="adresa" label="Adresă" defaultValue={v.adresa ?? ""} error={e.adresa} autoComplete="street-address" />
      <div className="row2 stack-sm">
        <TextField
          name="familie"
          label="Familie"
          defaultValue={v.familie ?? ""}
          error={e.familie}
          hint="Numele familiei, dacă aveți rude în biserică."
        />
        <SelectField
          name="rudenie"
          label="Grad de rudenie"
          defaultValue={v.rudenie ?? ""}
          error={e.rudenie}
          emptyLabel="—"
          options={nomenOptions(rudenie)}
        />
      </div>

      {kind === "TRANSFER" ? (
        <fieldset className="card">
          <h3>Transfer</h3>
          <TextField
            name="bisericaProvenienta"
            label="Biserica de proveniență"
            defaultValue={v.bisericaProvenienta ?? ""}
            error={e.bisericaProvenienta}
          />
          <fieldset className="subfields">
            <legend>Botez în apă</legend>
            <div className="row2 stack-sm">
              <TextField name="dataBotez" label="Data botezului" type="date" defaultValue={v.dataBotez ?? ""} error={e.dataBotez} />
              <TextField name="botezBiserica" label="Biserica" defaultValue={v.botezBiserica ?? ""} error={e.botezBiserica} />
            </div>
            <div className="row2 stack-sm">
              <TextField name="botezLocalitate" label="Localitatea" defaultValue={v.botezLocalitate ?? ""} error={e.botezLocalitate} />
              <TextField name="botezOficiant" label="Oficiat de" defaultValue={v.botezOficiant ?? ""} error={e.botezOficiant} />
            </div>
          </fieldset>
        </fieldset>
      ) : null}

      <TextAreaField name="mesaj" label="Mesaj (opțional)" defaultValue={v.mesaj ?? ""} error={e.mesaj} maxLength={APPLICATION_MESSAGE_MAX} />

      <div className="hp" aria-hidden="true">
        <label htmlFor="f-website">Site web</label>
        <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {statutes.map((s) => {
        const info = STATUTE[s.kind];
        const field = info.consentField;
        return (
          <div className="card" key={s.kind}>
            <h3>{info.label}</h3>
            <a
              href={`/cerere/${slug}/statut/${info.slug}`}
              target="_blank"
              rel="noopener"
              className="btn mb-2"
              onClick={() => markOpened(s)}
            >
              <Icon name="documente" className="size-[18px]" /> Deschide statutul
            </a>
            <label className="consent">
              <input
                type="checkbox"
                name={field}
                disabled={!opened[s.kind]}
                checked={Boolean(agreed[s.kind])}
                onChange={(ev) => setAgreed((a) => ({ ...a, [s.kind]: ev.target.checked }))}
                aria-invalid={e[field] ? true : undefined}
                aria-describedby={opened[s.kind] ? undefined : `hint-${field}`}
              />
              <span>{info.consentLabel}</span>
            </label>
            {opened[s.kind] ? null : (
              <p className="hint" id={`hint-${field}`}>
                Deschideți statutul pentru a putea bifa.
              </p>
            )}
            {e[field] ? (
              <div className="field-error" role="alert">
                {e[field]}
              </div>
            ) : null}
          </div>
        );
      })}

      <label className="consent">
        <input
          type="checkbox"
          name="consent"
          checked={gdpr}
          onChange={(ev) => setGdpr(ev.target.checked)}
          aria-invalid={e.consent ? true : undefined}
        />
        <span>Sunt de acord ca datele mele să fie păstrate de biserică în scopul evidenței membrilor.</span>
      </label>
      {e.consent ? (
        <div className="field-error mb-3" role="alert">
          {e.consent}
        </div>
      ) : null}

      <FormMessage state={state} />
      {ready ? null : (
        <p className="hint mt-2">
          {statutes.length ? "Pentru a trimite cererea, bifați acordul cu fiecare statut și acordul pentru păstrarea datelor." : "Pentru a trimite cererea, bifați acordul pentru păstrarea datelor."}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full min-h-11 mt-2" disabled={pending || !ready}>
        <Icon name="trimite" className="size-[18px]" />
        {pending ? "Se trimite…" : "Trimite cererea"}
      </button>
    </form>
  );
}
