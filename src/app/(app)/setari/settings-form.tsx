"use client";

import { isGeneralAssembly } from "@/lib/general-assembly";
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { AddressFields } from "@/components/ui/address-fields";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { ATTENDANCE_RULE_LABEL, ATTENDANCE_RULES, type AttendanceRule } from "@/lib/attendance";
import { DOCUMENT_TYPE_LABEL, DOCUMENT_TYPES, type Nomenclatures } from "@/lib/labels";
import { saveChurchSettingsAction } from "@/server/actions/settings";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";

type ChurchTextFields = "nume" | "adresa" | "codPostal" | "localitate" | "orgNr" | "telefon" | "email" | "pastor" | "secretar" | "pastorEmail" | "secretarEmail" | "slug" | "comunitate";

export function SettingsForm({
  church,
  nomen,
  attendanceRules,
  tipuriAG,
  tipuriCvorum,
  formUrl,
  readOnly,
  privacyText,
  privacyUrl,
  applicationLink,
}: {
  /** The QR / share panel of the application link (outside the read-only fieldset). */
  applicationLink?: ReactNode;
  church: Record<ChurchTextFields, string> & {
    applicationsOpen: boolean;
    require2fa: boolean;
    passkeyPolicy: boolean;
    semnaturaUnica: string;
    semnaturaUnicaTipuri: string[];
  };
  /** The notice as published (the saved text, or the template filled with the church's details). */
  privacyText: string;
  privacyUrl: string;
  nomen: Nomenclatures;
  attendanceRules: Record<string, AttendanceRule>;
  tipuriAG: string[];
  tipuriCvorum: string[];
  /** Full address of the public application form, for the copy button. */
  formUrl: string;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(saveChurchSettingsAction, initialFormState);
  const v = state.values;
  const e = state.errors ?? {};
  const val = (k: ChurchTextFields) => v?.[k] ?? church[k];
  const applicationsOpen = v ? v.applicationsOpen === "on" : church.applicationsOpen;
  const require2fa = v ? v.require2fa === "on" : church.require2fa;
  const passkeyPolicy = v ? v.passkeyPolicy === "on" : church.passkeyPolicy;
  const [freshMode, setFreshMode] = useState(v?.semnaturaUnica ?? church.semnaturaUnica);
  const nom = (name: string, label: string, list: string[]) => (
    <TextAreaField
      name={name}
      label={label}
      defaultValue={v?.[name] ?? list.join("\n")}
      error={e[name]}
      readOnly={readOnly}
      className="[&_textarea]:!min-h-[92px]"
    />
  );
  return (
    <form action={action} noValidate>
      <fieldset className="card" disabled={readOnly}>
        <h3 id="organizatia">Organizația</h3>
        <TextField name="nume" label="Numele bisericii" placeholder="ex. Maranata Stavanger" defaultValue={val("nume")} error={e.nume} required />
        <AddressFields values={{ adresa: val("adresa"), codPostal: val("codPostal"), localitate: val("localitate") }} errors={e} />
        <div className="row2 stack-sm">
          <TextField name="orgNr" label="Org.nr. / cod fiscal" defaultValue={val("orgNr")} error={e.orgNr} />
          <TextField name="telefon" label="Telefon" defaultValue={val("telefon")} error={e.telefon} />
        </div>
        <TextField name="email" label="E-mail" type="email" defaultValue={val("email")} error={e.email} />
        <TextField
          name="comunitate"
          label="Comunitatea de care aparține biserica"
          placeholder="ex. Comunitatea Bisericilor Penticostale …"
          defaultValue={val("comunitate")}
          error={e.comunitate}
          hint="Apare în nota de informare și în informările către Comunitate."
        />
        <div className="row2 stack-sm">
          <TextField name="pastor" label="Pastor" defaultValue={val("pastor")} error={e.pastor} hint="Semnează documentele." />
          <TextField name="secretar" label="Secretar" defaultValue={val("secretar")} error={e.secretar} hint="Semnează documentele și PV-urile." />
        </div>
        <div className="row2 stack-sm">
          <TextField name="pastorEmail" label="E-mail pastor" type="email" defaultValue={val("pastorEmail")} error={e.pastorEmail} hint="Primește procesele-verbale trimise din aplicație." />
          <TextField name="secretarEmail" label="E-mail secretar" type="email" defaultValue={val("secretarEmail")} error={e.secretarEmail} hint="Primește procesele-verbale trimise din aplicație." />
        </div>
        <TextField
          name="slug"
          label="Adresă publică a cererii"
          defaultValue={val("slug")}
          error={e.slug}
          autoComplete="off"
          spellCheck={false}
          hint={
            <>
              Formularul de cerere de membru:{" "}
              <a href={formUrl} target="_blank" rel="noopener noreferrer" className="break-all">
                {formUrl}
              </a>
            </>
          }
        />
        <div className="-mt-1.5 mb-3.5">
          <CopyButton text={formUrl} label="Copiază adresa" />
        </div>
        <label className="switch-row">
          <input type="checkbox" role="switch" name="applicationsOpen" defaultChecked={applicationsOpen} />
          <span>
            <span className="block font-medium">Primește cereri de membru online</span>
            <span className="hint block !mt-0">Când este pornit, oricine are adresa de mai sus poate trimite o cerere.</span>
          </span>
        </label>
        <label className="switch-row">
          <input type="checkbox" role="switch" name="require2fa" defaultChecked={require2fa} />
          <span>
            <span className="block font-medium">Autentificare în doi pași obligatorie</span>
            <span className="hint block !mt-0">
              La următoarea autentificare, utilizatorii fără cod (aplicație sau e-mail) sunt îndrumați să-l configureze.
            </span>
          </span>
        </label>
        <label className="switch-row">
          <input type="checkbox" role="switch" name="passkeyPolicy" defaultChecked={passkeyPolicy} />
          <span>
            <span className="block font-medium">Pastorii și administratorii intră cu parolă + Face ID / amprentă</span>
            <span className="hint block !mt-0">
              Pentru ei nu se mai oferă intrarea doar cu Face ID, iar al doilea pas este deblocarea telefonului. Codurile rămân doar de rezervă: fiecare
              folosire este înregistrată și apare pe Acasă pentru administratori.
            </span>
          </span>
        </label>
        <div className="field">
          <label htmlFor="semnaturaUnica">Semnătura se desenează de fiecare dată</label>
          <select id="semnaturaUnica" name="semnaturaUnica" value={freshMode} onChange={(e) => setFreshMode(e.target.value)}>
            <option value="">Nu — se poate folosi semnătura salvată (cu deblocarea dispozitivului)</option>
            <option value="TOATE">Da, pentru toate documentele</option>
            <option value="TIPURI">Da, pentru tipurile alese</option>
          </select>
          {freshMode === "TIPURI" ? (
            <div className="attendance-flags mt-1">
              {DOCUMENT_TYPES.map((t) => (
                <label key={t} className="check">
                  <input type="checkbox" name={`semnatura:${t}`} defaultChecked={v ? v[`semnatura:${t}`] === "on" : church.semnaturaUnicaTipuri.includes(t)} />
                  {DOCUMENT_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </fieldset>
      {applicationLink}
      <fieldset className="card" disabled={readOnly}>
        <h3 id="confidentialitate">Confidențialitate</h3>
        <p className="hint mb-2">
          Textul public despre datele personale:{" "}
          <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="break-all">
            {privacyUrl}
          </a>
          . Șters complet, textul revine la modelul bisericii (versiunea {PRIVACY_NOTICE_VERSION}), completat cu datele de mai sus.
        </p>
        <TextAreaField
          name="privacyText"
          label="Nota de confidențialitate"
          defaultValue={v?.privacyText ?? privacyText}
          error={e.privacyText}
          className="[&_textarea]:!min-h-[220px]"
        />
      </fieldset>
      <fieldset className="card" disabled={readOnly}>
        <h3 id="nomenclatoare">Nomenclatoare</h3>
        <div className="hint mb-2.5">Câte o valoare pe linie. O listă goală revine la valorile implicite.</div>
        {nom("tipuriSedinte", "Tipuri de ședințe", nomen.tipuriSedinte)}
        <div className="attendance-rules mb-3.5">
          <div className="text-[0.8125rem] font-medium text-ink-2 mb-1">Lista de prezență la ședința nouă</div>
          <p className="hint !mt-0 mb-2">
            „Toți membrii” bifează membrii în evidență, „Comitetul” pe cei bifați „Membru în comitet” pe fișa persoanei; cei bifați automat și debifați apar ca
            absenți. Un tip nou primește regula după salvare. „Adunare Generală” arată în procesul-verbal membrii cu drepturi depline, prezenții și
            convocarea în loc de cvorum (Statut art. 46; fără nicio bifă: tipul „Adunare generală”); „Cvorum” arată linia de cvorum.
          </p>
          {nomen.tipuriSedinte.map((t) => (
            <div key={t} className="attendance-type">
            <label className="attendance-rule">
              <span className="min-w-0">{t}</span>
              <select name={`regula:${t}`} defaultValue={v?.[`regula:${t}`] ?? attendanceRules[t] ?? "MANUAL"} aria-label={`Prezența la ${t}`}>
                {ATTENDANCE_RULES.map((r) => (
                  <option key={r} value={r}>
                    {ATTENDANCE_RULE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <div className="attendance-flags">
              <label className="check">
                <input type="checkbox" name={`ag:${t}`} defaultChecked={v ? v[`ag:${t}`] === "on" : isGeneralAssembly(t, tipuriAG)} />
                Adunare Generală
              </label>
              <label className="check">
                <input type="checkbox" name={`cvorum:${t}`} defaultChecked={v ? v[`cvorum:${t}`] === "on" : tipuriCvorum.includes(t)} />
                Cvorum
              </label>
            </div>
            </div>
          ))}
        </div>
        {nom("tipuriEvenimente", "Tipuri de evenimente", nomen.tipuriEvenimente)}
        {nom("tipuriMentiuni", "Tipuri de mențiuni", nomen.tipuriMentiuni)}
        {nom("gradeRudenie", "Grade de rudenie", nomen.rudenie)}
        {nom("categoriiPatrimoniu", "Categorii de bunuri (patrimoniu)", nomen.categoriiPatrimoniu)}
        <p className="hint mb-2.5">
          Subcategoriile fiecărei categorii (ex. Sonorizare și video → Microfoane): <Link href="/setari/patrimoniu">Categorii de patrimoniu</Link>.
        </p>
        <p className="hint mb-2.5">
          Funcțiile și slujirile (pastor, diacon, cor, media …) au pagina lor: <Link href="/setari/functii">Funcții și slujiri</Link>.
        </p>
        <div className="hint">
          Statistica folosește tipurile de eveniment „Nuntă” și „Înmormântare”, iar certificatul de binecuvântare
          gradele „Cap de familie”, „Soție” și „Soț” (părinții sunt capul familiei și soția sau soțul) — păstrați aceste denumiri.
        </div>
      </fieldset>
      <FormMessage state={state} />
      {!readOnly ? (
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : "Salvează setările"}
        </button>
      ) : (
        <p className="hint">Doar administratorul poate modifica setările.</p>
      )}
    </form>
  );
}
