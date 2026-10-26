"use client";

import { PRAYER_CHILDREN_HELP, PRAYER_CHILDREN_LABEL } from "@/lib/prayer";
import { useState } from "react";
import { AddressFields } from "@/components/ui/address-fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import type { FormState } from "@/lib/form-state";
import { isMinorByBirth, unmarriedLabel } from "@/lib/marital";
import { todayIso } from "@/lib/dates";
import { Icon } from "@/components/shell/icons";
import { CONSENT_QUESTION, CONSENT_QUESTION_CHILD, GENDER_LABEL, OPTIONAL_CONSENTS, type OptionalConsentKey } from "@/lib/labels";
import { CHILD_LABEL, SELF_FIELDS, SELF_LABEL, type SelfData, type SelfField } from "@/lib/schemas/data-update";
import { PrivacyText } from "../confidentialitate/privacy-text";

export interface ChildState {
  key: string;
  id: string | null;
  nume: string;
  prenume: string;
  gen: string;
  dataNasterii: string;
  dataBinecuvantare: string;
  consents: Partial<Record<OptionalConsentKey, boolean>>;
}

const ADDRESS_FIELDS: readonly SelfField[] = ["adresa", "codPostal", "localitate"];
const TYPES: Partial<Record<SelfField, string>> = {
  dataNasterii: "date",
  dataCasatoriei: "date",
  dataBotez: "date",
  telefon: "tel",
  email: "email",
  botezAn: "number",
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * Step 2 of the data-update form: own data, own minor children, the privacy notice and the four
 * optional consents (each answered Da or Nu, no default). Personal link: prefilled, changed fields
 * highlighted. General link: always empty.
 */
export function UpdateForm({
  action,
  self,
  register,
  childrenInitial,
  consents,
  privacyText,
  prayer,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  self: Partial<SelfData>;
  /** The register's values, to highlight what the person changed (personal link only). */
  register?: Partial<SelfData>;
  childrenInitial: ChildState[];
  consents: Partial<Record<OptionalConsentKey, boolean>>;
  privacyText: string;
  /** The weekly prayer section (head, spouse, adult without a family): the answers so far; absent = not shown. */
  prayer?: { optOut: boolean; includeChildren: boolean };
}) {
  const { state, pending, onSubmit } = useActionForm(action);
  const e = state.errors ?? {};
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<ChildState[]>(childrenInitial);
  const [nextKey, setNextKey] = useState(1);
  const [gen, setGen] = useState(str(self.gen));
  const [birth, setBirth] = useState(str(self.dataNasterii));
  const [marriage, setMarriage] = useState(str(self.dataCasatoriei));
  const [unmarried, setUnmarried] = useState(Boolean(self.necasatorit));
  const registerChildren = new Map(childrenInitial.filter((c) => c.id).map((c) => [c.id, c]));

  const mark = (name: string, value: string, base: string) =>
    setChanged((prev) => {
      const next = new Set(prev);
      if (value !== base) next.add(name);
      else next.delete(name);
      return next;
    });
  // The marriage date and the flag are one field for the highlighting.
  const markMarital = (date: string, flag: boolean) =>
    mark("dataCasatoriei", flag ? "necasatorit" : date, register?.necasatorit ? "necasatorit" : str(register?.dataCasatoriei));
  const updateChild = (key: string, patch: Partial<ChildState>) => setChildren((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const childJson = JSON.stringify(
    children.map((c) => ({
      id: c.id,
      nume: c.nume,
      prenume: c.prenume,
      gen: c.gen,
      dataNasterii: c.dataNasterii,
      dataBinecuvantare: c.dataBinecuvantare,
      consents: Object.fromEntries(OPTIONAL_CONSENTS.map((k) => [k, c.consents[k] === undefined ? null : c.consents[k] ? "da" : "nu"])),
    })),
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      {register ? (
        <p className="mb-3">
          <a href="#acorduri" className="btn btn-sm">
            Datele sunt corecte — mergi la acorduri
          </a>
        </p>
      ) : null}
      <fieldset className="card">
        <h3>Datele dumneavoastră</h3>
        {register ? <p className="hint mb-3">Câmpurile pe care le modificați sunt evidențiate.</p> : null}
        <div className="row2 stack-sm">
          {SELF_FIELDS.filter((f) => !ADDRESS_FIELDS.includes(f)).map((f) => {
            const base = str(register?.[f]);
            const id = `f-${f}`;
            return (
              <div key={f} className={changed.has(f) ? "field field-changed" : "field"}>
                <label htmlFor={id}>{SELF_LABEL[f]}</label>
                {f === "gen" ? (
                  <select
                    id={id}
                    name="gen"
                    defaultValue={str(self.gen)}
                    onChange={(ev) => {
                      setGen(ev.target.value);
                      if (register) mark(f, ev.target.value, base);
                    }}
                    aria-invalid={e.gen ? true : undefined}
                  >
                    <option value="">—</option>
                    <option value="M">{GENDER_LABEL.M}</option>
                    <option value="F">{GENDER_LABEL.F}</option>
                  </select>
                ) : f === "dataCasatoriei" ? (
                  <>
                    <input
                      id={id}
                      name={f}
                      type="date"
                      value={unmarried ? "" : marriage}
                      disabled={unmarried}
                      autoComplete="off"
                      onChange={(ev) => {
                        setMarriage(ev.target.value);
                        if (ev.target.value) setUnmarried(false);
                        if (register) markMarital(ev.target.value, false);
                      }}
                      aria-invalid={e[f] ? true : undefined}
                      aria-describedby={e[f] ? `${id}-err` : undefined}
                    />
                    {isMinorByBirth(birth, todayIso()) ? null : (
                      <label className="choice mt-2">
                        <input
                          type="checkbox"
                          name="necasatorit"
                          checked={unmarried}
                          onChange={(ev) => {
                            setUnmarried(ev.target.checked);
                            if (ev.target.checked) setMarriage("");
                            if (register) markMarital(ev.target.checked ? "" : marriage, ev.target.checked);
                          }}
                        />
                        <span className="tick" aria-hidden="true">
                          <Icon name="bifa" className="size-[14px]" />
                        </span>
                        {unmarriedLabel(gen)}
                      </label>
                    )}
                    {e.necasatorit ? <p className="field-error">{e.necasatorit}</p> : null}
                  </>
                ) : (
                  <input
                    id={id}
                    name={f}
                    type={TYPES[f] ?? "text"}
                    defaultValue={str(self[f])}
                    autoComplete="off"
                    onInput={(ev) => {
                      if (f === "dataNasterii") setBirth(ev.currentTarget.value);
                      if (register) mark(f, ev.currentTarget.value, base);
                    }}
                    aria-invalid={e[f] ? true : undefined}
                    aria-describedby={e[f] ? `${id}-err` : undefined}
                  />
                )}
                {e[f] ? (
                  <p id={`${id}-err`} className="field-error">
                    {e[f]}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <AddressFields
          values={self}
          errors={e}
          highlight={(n) => changed.has(n)}
          onValue={(n, v) => register && mark(n, v, str(register[n]))}
        />
        <p className="hint">Numele părinților doar dacă părinții nu sunt în evidența bisericii. Pentru botez: data sau doar anul.</p>
      </fieldset>

      <fieldset className="card">
        <h3>Copiii minori</h3>
        <input type="hidden" name="copii" value={childJson} />
        {children.length ? null : <p className="hint mb-3">Niciun copil minor. Adăugați-i dacă lipsesc.</p>}
        {children.map((c, i) => {
          const reg = c.id ? registerChildren.get(c.id) : undefined;
          const cls = (f: keyof ChildState) => (reg && str(reg[f]) !== str(c[f]) ? "field field-changed" : "field");
          const err = (f: string) => e[`copii.${i}.${f}`];
          return (
            <div key={c.key} className="child-block">
              <h4>{c.id ? `${c.prenume || c.nume}` : `Copil nou ${i + 1}`}</h4>
              <div className="row2 stack-sm">
                {(["nume", "prenume"] as const).map((f) => (
                  <div key={f} className={cls(f)}>
                    <label htmlFor={`c${c.key}-${f}`}>{CHILD_LABEL[f]}</label>
                    <input id={`c${c.key}-${f}`} value={c[f]} onChange={(ev) => updateChild(c.key, { [f]: ev.target.value })} aria-invalid={err(f) ? true : undefined} />
                    {err(f) ? <p className="field-error">{err(f)}</p> : null}
                  </div>
                ))}
                <div className={cls("gen")}>
                  <label htmlFor={`c${c.key}-gen`}>{CHILD_LABEL.gen}</label>
                  <select id={`c${c.key}-gen`} value={c.gen} onChange={(ev) => updateChild(c.key, { gen: ev.target.value })}>
                    <option value="">—</option>
                    <option value="M">{GENDER_LABEL.M}</option>
                    <option value="F">{GENDER_LABEL.F}</option>
                  </select>
                </div>
                {(["dataNasterii", "dataBinecuvantare"] as const).map((f) => (
                  <div key={f} className={cls(f)}>
                    <label htmlFor={`c${c.key}-${f}`}>{CHILD_LABEL[f]}</label>
                    <input id={`c${c.key}-${f}`} type="date" value={c[f]} onChange={(ev) => updateChild(c.key, { [f]: ev.target.value })} aria-invalid={err(f) ? true : undefined} />
                    {err(f) ? <p className="field-error">{err(f)}</p> : null}
                  </div>
                ))}
              </div>
              <p className="hint mb-2">Acordurile pentru copil, date de dumneavoastră ca părinte:</p>
              {OPTIONAL_CONSENTS.map((k) => (
                <YesNo
                  key={k}
                  name={`c${c.key}-${k}`}
                  question={CONSENT_QUESTION_CHILD[k]}
                  value={c.consents[k]}
                  onChange={(v) => updateChild(c.key, { consents: { ...c.consents, [k]: v } })}
                  error={err(`consents.${k}`)}
                />
              ))}
              {!c.id ? (
                <button type="button" className="btn btn-sm" onClick={() => setChildren((list) => list.filter((x) => x.key !== c.key))}>
                  Renunță la acest copil
                </button>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          className="btn"
          onClick={() => {
            setChildren((list) => [...list, { key: `n${nextKey}`, id: null, nume: list[0]?.nume ?? "", prenume: "", gen: "", dataNasterii: "", dataBinecuvantare: "", consents: {} }]);
            setNextKey((k) => k + 1);
          }}
        >
          Adaugă un copil
        </button>
        {e.copii ? <p className="field-error">{e.copii}</p> : null}
      </fieldset>

      <fieldset className="card" id="acorduri">
        <h3>Nota de informare și acordurile</h3>
        <details className="mb-3">
          <summary className="btn btn-sm">Citește nota de informare privind prelucrarea datelor</summary>
          <div className="mt-3 scroll-panel">
            <PrivacyText text={privacyText} />
          </div>
        </details>
        <label className="check">
          <input type="checkbox" name="nota" aria-invalid={e.nota ? true : undefined} />
          Am citit nota de informare privind prelucrarea datelor
        </label>
        {e.nota ? <p className="field-error">{e.nota}</p> : null}
        <p className="hint mt-3 mb-2">Acordurile sunt opționale: alegeți Da sau Nu la fiecare. Un „Nu” nu vă afectează în niciun fel.</p>
        {OPTIONAL_CONSENTS.map((k) => (
          <YesNo key={k} name={`acord_${k}`} question={CONSENT_QUESTION[k]} defaultValue={consents[k]} error={e[`acord_${k}`]} />
        ))}
      </fieldset>

      {prayer ? (
        <fieldset className="card" id="rugaciune">
          <h3>Rugăciunea săptămânală pentru familii</h3>
          <p className="hint mb-3">
            În fiecare săptămână biserica se roagă pentru o familie. O persoană desemnată de comitet o anunță pe grupul bisericii, doar cu
            numele familiei și prenumele părinților. Puteți cere oricând să nu fiți pomeniți, fără nicio explicație. Prenumele copiilor apar
            numai cu acordul dumneavoastră.
          </p>
          <input type="hidden" name="rugaciuneSectiune" value="1" />
          <label className="check">
            <input type="checkbox" name="rugaciuneNepomenita" defaultChecked={prayer.optOut} />
            Nu doresc ca familia mea să fie pomenită pe grupul bisericii
          </label>
          <label className="check">
            <input type="checkbox" name="rugaciuneCopii" defaultChecked={prayer.includeChildren} />
            {PRAYER_CHILDREN_LABEL}
          </label>
          <p className="hint !mt-0 ml-8">{PRAYER_CHILDREN_HELP}</p>
        </fieldset>
      ) : null}

      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <FormMessage state={state} />
      <div className="actions">
        <div className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se trimite…" : "Trimite"}
        </button>
      </div>
    </form>
  );
}

/** A required Da / Nu answer without a default (a fieldset of two radio buttons, 44 px each). */
function YesNo({
  name,
  question,
  value,
  defaultValue,
  onChange,
  error,
}: {
  name: string;
  question: string;
  value?: boolean;
  defaultValue?: boolean;
  onChange?: (v: boolean) => void;
  error?: string;
}) {
  const controlled = onChange !== undefined;
  return (
    <fieldset className="yes-no" aria-invalid={error ? true : undefined}>
      <legend>{question}</legend>
      <div className="yes-no-options">
        {([true, false] as const).map((v) => (
          <label key={String(v)} className="yes-no-option">
            <input
              type="radio"
              name={name}
              value={v ? "da" : "nu"}
              {...(controlled ? { checked: value === v, onChange: () => onChange(v) } : { defaultChecked: defaultValue === v })}
            />
            {v ? "Da" : "Nu"}
          </label>
        ))}
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </fieldset>
  );
}
