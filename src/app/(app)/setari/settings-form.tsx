"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { ATTENDANCE_RULE_LABEL, ATTENDANCE_RULES, type AttendanceRule } from "@/lib/attendance";
import type { Nomenclatures } from "@/lib/labels";
import { saveChurchSettingsAction } from "@/server/actions/settings";

type ChurchTextFields = "nume" | "adresa" | "orgNr" | "telefon" | "email" | "pastor" | "secretar" | "pastorEmail" | "secretarEmail" | "slug";

export function SettingsForm({
  church,
  nomen,
  attendanceRules,
  formUrl,
  readOnly,
  privacyText,
  privacyUrl,
  extractAvailable,
  applicationLink,
}: {
  /** The QR / share panel of the application link (outside the read-only fieldset). */
  applicationLink?: ReactNode;
  church: Record<ChurchTextFields, string> & { applicationsOpen: boolean; require2fa: boolean; extractEnabled: boolean };
  /** The notice as published (the saved text, or the template filled with the church's details). */
  privacyText: string;
  privacyUrl: string;
  /** Reading scans with Claude is possible on this installation. */
  extractAvailable: boolean;
  nomen: Nomenclatures;
  attendanceRules: Record<string, AttendanceRule>;
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
  const extractEnabled = v ? v.extractEnabled === "on" : church.extractEnabled;
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
        <h3>Organizația</h3>
        <TextField name="nume" label="Numele bisericii" placeholder="ex. Maranata Stavanger" defaultValue={val("nume")} error={e.nume} required />
        <TextField name="adresa" label="Adresă" defaultValue={val("adresa")} error={e.adresa} />
        <div className="row2 stack-sm">
          <TextField name="orgNr" label="Org.nr. / cod fiscal" defaultValue={val("orgNr")} error={e.orgNr} />
          <TextField name="telefon" label="Telefon" defaultValue={val("telefon")} error={e.telefon} />
        </div>
        <TextField name="email" label="E-mail" type="email" defaultValue={val("email")} error={e.email} />
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
      </fieldset>
      {applicationLink}
      <fieldset className="card" disabled={readOnly}>
        <h3>Confidențialitate</h3>
        <p className="hint mb-2">
          Textul public despre datele personale:{" "}
          <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="break-all">
            {privacyUrl}
          </a>
          . Rândurile care încep cu „## ” sunt titluri. Șters complet, textul revine la model.
        </p>
        <TextAreaField
          name="privacyText"
          label="Nota de confidențialitate"
          defaultValue={v?.privacyText ?? privacyText}
          error={e.privacyText}
          className="[&_textarea]:!min-h-[220px]"
        />
        <label className="switch-row">
          <input type="checkbox" role="switch" name="extractEnabled" defaultChecked={extractEnabled} disabled={!extractAvailable && !extractEnabled} />
          <span>
            <span className="block font-medium">Citirea automată a documentelor scanate (Claude, Anthropic)</span>
            <span className="hint block !mt-0">
              Pornind-o, sunteți de acord ca fotografiile și documentele încărcate la „Adaugă din document” și „Importă” să fie trimise
              către Anthropic, PBC (Statele Unite ale Americii), care le citește în numele bisericii. Datele trimise prin serviciul pentru
              organizații nu sunt folosite la antrenarea modelelor; prelucrarea are loc în afara Spațiului Economic European, în baza
              clauzelor contractuale standard din acordul de prelucrare a datelor al Anthropic. Aplicația nu păstrează fișierele.
              {!extractAvailable ? " Citirea nu este configurată pentru această aplicație." : ""}
            </span>
          </span>
        </label>
      </fieldset>
      <fieldset className="card" disabled={readOnly}>
        <h3>Nomenclatoare</h3>
        <div className="hint mb-2.5">Câte o valoare pe linie. O listă goală revine la valorile implicite.</div>
        {nom("tipuriSedinte", "Tipuri de ședințe", nomen.tipuriSedinte)}
        <div className="attendance-rules mb-3.5">
          <div className="text-[0.8125rem] font-medium text-ink-2 mb-1">Lista de prezență la ședința nouă</div>
          <p className="hint !mt-0 mb-2">
            „Toți membrii” bifează membrii în evidență, „Comitetul” pe cei bifați „Membru în comitet” pe fișa persoanei; cei bifați automat și debifați apar ca
            absenți. Un tip nou primește regula după salvare.
          </p>
          {nomen.tipuriSedinte.map((t) => (
            <label key={t} className="attendance-rule">
              <span className="min-w-0">{t}</span>
              <select name={`regula:${t}`} defaultValue={v?.[`regula:${t}`] ?? attendanceRules[t] ?? "MANUAL"} aria-label={`Prezența la ${t}`}>
                {ATTENDANCE_RULES.map((r) => (
                  <option key={r} value={r}>
                    {ATTENDANCE_RULE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {nom("tipuriEvenimente", "Tipuri de evenimente", nomen.tipuriEvenimente)}
        {nom("tipuriMentiuni", "Tipuri de mențiuni", nomen.tipuriMentiuni)}
        {nom("gradeRudenie", "Grade de rudenie", nomen.rudenie)}
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
