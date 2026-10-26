"use client";

import Link from "next/link";
import { useState } from "react";
import { PersonNav } from "@/components/person-nav";
import { useUnsavedGuard } from "@/components/ui/unsaved-guard";
import { nomenOptions, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { useActionForm } from "@/components/ui/use-action-form";
import { todayIso } from "@/lib/dates";
import type { PersonFormState } from "@/lib/form-state";
import { ENTRY_LABEL, ENTRY_MODES, EXIT_LABEL, EXIT_MODES, GENDER_LABEL, GENDERS, PERSON_STATUSES, STATUS_HINT, STATUS_LABEL, type PersonStatusKey } from "@/lib/labels";
import { savePersonAction } from "@/server/actions/persons";
import { FamilyField, type FamilyChoice } from "./family-field";
import { OfficiantField } from "@/components/officiant-field";
import type { OfficiantOption } from "@/lib/officiants";
import { RolesPicker, type RoleChoiceGroup } from "./roles-picker";
import type { MeetingChoice } from "@/server/queries/meetings";

export type PersonFormValues = Record<string, string>;

const opts = <K extends string>(keys: readonly K[], labels: Record<K, string>) => keys.map((k) => ({ value: k, label: labels[k] }));

export function PersonForm({
  id,
  initial,
  families,
  lockedFamily,
  rudenie,
  roles,
  meetings = [],
  contactRestricted = false,
  cancelHref,
  committeeWarnings,
  officiants = [],
  applicationId,
  submitLabel = "Salvează",
  din,
  nav,
}: {
  id: string | null;
  initial: PersonFormValues;
  families: FamilyChoice[];
  /** The person heads a family with other members: the family cannot be changed here. */
  lockedFamily?: { id: string; nume: string };
  rudenie: string[];
  /** Role groups with their active roles, plus inactive ones the person already holds. */
  roles: RoleChoiceGroup[];
  /** Minutes to link an entry (transfer, reabilitare) or an exclusion to. */
  meetings?: MeetingChoice[];
  /** A person who left, edited by a non-administrator: contact data are not shown and are kept as they are. */
  contactRestricted?: boolean;
  cancelHref: string;
  /** The art. 45 alin. 4 warnings next to "Membru în comitet" (src/server/queries/committee.ts). */
  committeeWarnings?: string[];
  /** Persons holding an ordained role, suggested for "Oficiat de" (Statut art. 30). */
  officiants?: OfficiantOption[];
  /** Accepting this membership application: saving also marks it accepted (or proposes it to the pastor). */
  applicationId?: string;
  /** "Propune acceptarea" / "Aprobă primirea" for an application. */
  submitLabel?: string;
  /** The Persoane list the person was opened from (see src/lib/person-nav.ts). */
  din?: string;
  /** Previous / next person of that list (edit form only). */
  nav?: { prevHref: string | null; nextHref: string | null; position: number; total: number };
}) {
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty);
  const { state: rawState, pending, onSubmit } = useActionForm(savePersonAction.bind(null, id));
  const state = rawState as PersonFormState;
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  const val = (k: string) => v[k] ?? "";
  const [statut, setStatut] = useState<PersonStatusKey>((val("statut") || "MEMBRU") as PersonStatusKey);
  const [baptised, setBaptised] = useState(Boolean(val("dataBotez") || val("botezAn")));
  const [modIntrare, setModIntrare] = useState(val("modIntrare"));
  const [modIesire, setModIesire] = useState(val("modIesire"));
  const meetingOptions = meetings.map((m) => ({ value: m.id, label: m.label }));
  const statusHint =
    STATUS_HINT[statut] + (statut === "MEMBRU" && !baptised ? " Atenție: botezul nu este completat (Statut art. 20)." : "");

  return (
    <form onSubmit={onSubmit} onInput={() => setDirty(true)} onChange={(ev) => {
        setDirty(true);
        const f = ev.currentTarget.elements;
        const value = (n: string) => (f.namedItem(n) as HTMLInputElement | null)?.value ?? "";
        setBaptised(Boolean(value("dataBotez") || value("botezAn")));
        // Statut art. 22 alin. 3: a member from the baptism date, or from the date of the approving minutes.
        const dm = f.namedItem("dataMembru") as HTMLInputElement | null;
        if (dm && !dm.value) {
          const mode = value("modIntrare");
          const meeting = meetings.find((m) => m.id === value("intrareMeetingId"));
          if (mode === "BOTEZ" && value("dataBotez")) dm.value = value("dataBotez");
          else if ((mode === "TRANSFER" || mode === "REPRIMIRE") && meeting) dm.value = meeting.data;
        }
      }} noValidate>
      {nav ? <PersonNav {...nav} /> : null}
      {din !== undefined ? <input type="hidden" name="din" value={din} /> : null}
      {applicationId ? <input type="hidden" name="cerere" value={applicationId} /> : null}
      <div className="row2">
        <TextField name="nume" label="Nume" defaultValue={val("nume")} error={e.nume} required autoComplete="off" />
        <TextField name="prenume" label="Prenume" defaultValue={val("prenume")} error={e.prenume} autoComplete="off" />
      </div>
      <div className="row2">
        <SelectField
          name="statut"
          label="Statut"
          defaultValue={val("statut") || "MEMBRU"}
          error={e.statut}
          hint={statusHint}
          onChange={(ev) => setStatut(ev.target.value as PersonStatusKey)}
          options={opts(PERSON_STATUSES, STATUS_LABEL)}
        />
        <SelectField name="gen" label="Gen" defaultValue={val("gen")} error={e.gen} emptyLabel="—" options={opts(GENDERS, GENDER_LABEL)} />
      </div>
      <FamilyField families={families} defaultValue={val("familyId")} error={e.familyId} locked={lockedFamily} />
      <div className="row2">
        <SelectField name="rudenie" label="Grad de rudenie" defaultValue={val("rudenie")} error={e.rudenie} emptyLabel="—" options={nomenOptions(rudenie, val("rudenie"))} />
        <TextField name="dataNasterii" label="Data nașterii" type="date" defaultValue={val("dataNasterii")} error={e.dataNasterii} />
      </div>
      {contactRestricted ? (
        <p className="hint mb-3">Datele de contact sunt restricționate după ieșirea din evidență; doar administratorii le văd și le modifică.</p>
      ) : (
        <>
          <div className="row2">
            <TextField name="telefon" label="Telefon" type="tel" defaultValue={val("telefon")} error={e.telefon} />
            <TextField name="email" label="E-mail" type="email" defaultValue={val("email")} error={e.email} />
          </div>
          <TextField name="adresa" label="Adresă" defaultValue={val("adresa")} error={e.adresa} />
        </>
      )}
      <div className="row2">
        <TextField name="dataCasatoriei" label="Data căsătoriei" type="date" defaultValue={val("dataCasatoriei")} error={e.dataCasatoriei} />
        <div />
      </div>
      <div className="row2">
        <TextField
          name="numeTata"
          label="Numele tatălui"
          defaultValue={val("numeTata")}
          error={e.numeTata}
          hint="Doar dacă părinții nu sunt în evidență."
          autoComplete="off"
        />
        <TextField name="numeMama" label="Numele mamei" defaultValue={val("numeMama")} error={e.numeMama} autoComplete="off" />
      </div>

      <fieldset className="card">
        <h3>Intrare în biserică</h3>
        <div className="row2">
          <TextField
            name="dataMembru"
            label="Data intrării"
            type="date"
            defaultValue={val("dataMembru")}
            error={e.dataMembru}
            hint="Folosită pentru statistica retroactivă."
          />
          <SelectField
            name="modIntrare"
            label="Mod"
            defaultValue={val("modIntrare")}
            error={e.modIntrare}
            emptyLabel="—"
            options={opts(ENTRY_MODES, ENTRY_LABEL)}
            onChange={(ev) => setModIntrare(ev.target.value)}
          />
        </div>
        {modIntrare === "TRANSFER" || modIntrare === "REPRIMIRE" || val("intrareMeetingId") ? (
          <SelectField
            name="intrareMeetingId"
            label="Procesul-verbal de aprobare"
            defaultValue={val("intrareMeetingId")}
            error={e.intrareMeetingId}
            emptyLabel="—"
            options={meetingOptions}
            hint={
              modIntrare === "REPRIMIRE"
                ? "Reabilitarea spirituală se consemnează într-un proces-verbal (Statut art. 22 alin. 3)."
                : "Transferul se avizează de pastor și comitet (Statut art. 23 alin. 3)."
            }
          />
        ) : null}
        <TextField
          name="bisericaProvenienta"
          label="Biserica de proveniență (la transfer)"
          defaultValue={val("bisericaProvenienta")}
          error={e.bisericaProvenienta}
        />
        <fieldset className="subfields">
          <legend>Botez în apă</legend>
          <div className="row2">
            <TextField name="dataBotez" label="Data botezului" type="date" defaultValue={val("dataBotez")} error={e.dataBotez} />
            <TextField
              name="botezAn"
              label="sau doar anul"
              type="number"
              inputMode="numeric"
              min={1900}
              max={Number(todayIso().slice(0, 4))}
              placeholder="ex. 2010"
              defaultValue={val("dataBotez") ? "" : val("botezAn")}
              error={e.botezAn}
            />
          </div>
          <div className="row2">
            <TextField name="botezBiserica" label="Biserica" placeholder="ex. Betel Oslo" defaultValue={val("botezBiserica")} error={e.botezBiserica} />
            <TextField name="botezLocalitate" label="Localitatea" defaultValue={val("botezLocalitate")} error={e.botezLocalitate} />
          </div>
          <OfficiantField name="botezOficiant" act="Botez" defaultValue={val("botezOficiant")} options={officiants} error={e.botezOficiant} />
        </fieldset>
        <TextField
          name="dataBinecuvantare"
          label="Binecuvântare ca copil"
          type="date"
          defaultValue={val("dataBinecuvantare")}
          error={e.dataBinecuvantare}
          className="mb-0"
        />
      </fieldset>

      <fieldset className="card">
        <h3>Ieșire din evidență</h3>
        <div className="row2">
          <TextField name="dataIesire" label="Data ieșirii" type="date" defaultValue={val("dataIesire")} error={e.dataIesire} />
          <SelectField
            name="modIesire"
            label="Mod"
            defaultValue={val("modIesire")}
            error={e.modIesire}
            emptyLabel="—"
            options={opts(EXIT_MODES, EXIT_LABEL)}
            onChange={(ev) => setModIesire(ev.target.value)}
          />
        </div>
        {modIesire === "RETRAGERE" || val("dataCerereRetragere") ? (
          <TextField
            name="dataCerereRetragere"
            label="Data cererii scrise"
            type="date"
            defaultValue={val("dataCerereRetragere")}
            error={e.dataCerereRetragere}
            hint="Retragerea se face pe baza unei cereri scrise (Statut art. 24 alin. 2)."
          />
        ) : null}
        {modIesire === "EXCLUDERE" || val("iesireMeetingId") ? (
          <SelectField
            name="iesireMeetingId"
            label="Procesul-verbal al excluderii"
            defaultValue={val("iesireMeetingId")}
            error={e.iesireMeetingId}
            emptyLabel="—"
            options={meetingOptions}
          />
        ) : null}
        <TextField
          name="bisericaDestinatie"
          label="Biserica de destinație (la transfer)"
          defaultValue={val("bisericaDestinatie")}
          error={e.bisericaDestinatie}
          hint="Cu dată de ieșire (în afară de deces), statutul devine automat „Fost membru”."
          className="mb-0"
        />
      </fieldset>

      <fieldset className="card">
        <h3>Plecat temporar</h3>
        <div className="row2">
          <TextField
            name="plecatDin"
            label="Plecat din"
            type="date"
            defaultValue={val("plecatDin")}
            error={e.plecatDin}
            hint="După 6 luni de absență trebuie cerut transferul (Statut art. 23 alin. 4–5)."
          />
          <TextField name="plecatUnde" label="Unde" placeholder="ex. Londra" defaultValue={val("plecatUnde")} error={e.plecatUnde} />
        </div>
      </fieldset>

      <RolesPicker groups={roles} initial={val("functii")} inComitet={val("inComitet") === "on"} committeeWarnings={committeeWarnings} error={e.functii} />

      <TextAreaField name="note" label="Note" defaultValue={val("note")} error={e.note} />

      {state.duplicate ? (
        <div className="alert" role="alert">
          {state.message}{" "}
          <Link href={`/persoane/${state.duplicate.id}`} target="_blank">
            {state.duplicate.name}
          </Link>
          <div className="mt-2">
            <button type="submit" name="fortat" value="1" className="btn btn-sm" disabled={pending}>
              Creează oricum
            </button>
          </div>
        </div>
      ) : (
        <FormMessage state={state} />
      )}
      <div className="actions">
        <Link href={cancelHref} className="btn btn-ghost">
          Renunță
        </Link>
        <div className="spacer" />
        {nav?.nextHref ? (
          <button type="submit" name="dupa" value="urmatorul" className="btn" disabled={pending}>
            Salvează și următorul
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Se salvează…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
