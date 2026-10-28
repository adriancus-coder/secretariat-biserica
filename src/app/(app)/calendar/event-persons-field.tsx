"use client";

import { useEffect, useMemo, useState } from "react";
import { PersonPicker } from "@/components/person-picker";
import { SelectField, TextField } from "@/components/ui/fields";
import { EVENT_ROLE_LABEL, eventKind, familyMinors, KIND_ROLES, suggestedTitle, type EventPersonInput, type EventPersonRole } from "@/lib/event-persons";
import { todayIso } from "@/lib/dates";
import { CHURCH_FAMILIES_TITLE, OTHER_FAMILIES_TITLE } from "@/lib/labels";
import { addChildToFamilyAction } from "@/server/actions/event-persons";
import type { EventFamilyOption, EventPersonOption } from "@/server/queries/event-persons";

/*
 * EVENT-PERSONS: the event form's rubric under „Tip”: the family and the persons the event is about.
 * Binecuvântare copil: the family (the church's first), its parents, its minors as ticks (under 2 first),
 * „+ Copil nou în familie”, or the child by name (the family follows). Botez: who is baptised (the
 * family proposes its members). Nuntă: the groom and the bride (from the register or a free name).
 * Înmormântare: the deceased. Other types: the family, optional. Sent as `familyId` and `persoane` (JSON).
 */

export function EventPersonsField({
  tip,
  initialFamilyId,
  initialPersons,
  families: initialFamilies,
  persons: initialPersonsList,
  error,
  onTitle,
}: {
  tip: string;
  initialFamilyId: string;
  initialPersons: EventPersonInput[];
  families: EventFamilyOption[];
  persons: EventPersonOption[];
  error?: string;
  /** The suggested title, for the form to fill an empty title with. */
  onTitle: (title: string) => void;
}) {
  const kind = eventKind(tip);
  const [families, setFamilies] = useState(initialFamilies);
  const [people, setPeople] = useState(initialPersonsList);
  const [familyId, setFamilyId] = useState(initialFamilyId);
  const [chosen, setChosen] = useState<EventPersonInput[]>(initialPersons);
  const family = families.find((f) => f.id === familyId) ?? null;
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const today = todayIso();

  // Only the persons of the type's roles are sent (a change of type drops the others).
  const roles = kind ? KIND_ROLES[kind] : [];
  const sent = chosen.filter((p) => roles.includes(p.rol));
  const names = sent.map((p) => (p.personId ? byId.get(p.personId) : null) ?? { nume: p.numeLiber, prenume: "" });
  const title = suggestedTitle(kind, names, family?.name ?? "");
  useEffect(() => {
    if (title) onTitle(title);
  }, [title, onTitle]);

  const has = (personId: string, rol: EventPersonRole) => chosen.some((p) => p.personId === personId && p.rol === rol);
  const toggle = (personId: string, rol: EventPersonRole, on: boolean) =>
    setChosen((c) => (on ? (has(personId, rol) ? c : [...c, { personId, numeLiber: "", rol }]) : c.filter((p) => !(p.personId === personId && p.rol === rol))));
  const setOne = (rol: EventPersonRole, value: { personId: string | null; numeLiber: string } | null) =>
    setChosen((c) => [...c.filter((p) => p.rol !== rol), ...(value && (value.personId || value.numeLiber) ? [{ ...value, rol }] : [])]);

  const familyPicker = (label: string, optional: boolean) => (
    <PersonPicker
      name="familyIdPicker"
      label={label}
      people={families.map((f) => ({ id: f.id, name: f.name, note: f.parents.join(", ") || undefined }))}
      sections={[{ title: CHURCH_FAMILIES_TITLE, ids: families.filter((f) => f.church).map((f) => f.id) }]}
      allTitle={OTHER_FAMILIES_TITLE}
      noneLabel="— fără familie —"
      emptyText={optional ? "Nicio familie aleasă (opțional)." : "Alegeți familia."}
      value={familyId}
      onChange={(id) => {
        setFamilyId(id);
        // The children ticked in another family are dropped.
        if (kind === "binecuvantare") setChosen((c) => c.filter((p) => !p.personId || byId.get(p.personId)?.familyId === id));
      }}
    />
  );

  // „+ Copil nou în familie”.
  const [adding, setAdding] = useState(false);
  const [child, setChild] = useState({ prenume: "", nume: "", gen: "", dataNasterii: "" });
  const [childError, setChildError] = useState("");
  const [saving, setSaving] = useState(false);
  async function addChild() {
    if (!family) return;
    setSaving(true);
    setChildError("");
    const r = await addChildToFamilyAction(family.id, child);
    setSaving(false);
    if (!r.child) {
      setChildError(r.message || Object.values(r.errors ?? {})[0] || "Copilul nu a putut fi adăugat.");
      return;
    }
    const c = r.child;
    setFamilies((fs) => fs.map((f) => (f.id === family.id ? { ...f, members: [...f.members, { id: c.id, nume: c.nume, prenume: c.prenume, dataNasterii: c.dataNasterii, gen: c.gen }] } : f)));
    setPeople((ps) => [...ps, { id: c.id, name: `${c.nume} ${c.prenume}`.trim(), nume: c.nume, prenume: c.prenume, familyId: family.id, dataNasterii: c.dataNasterii, gen: c.gen }]);
    setChosen((cs) => [...cs, { personId: c.id, numeLiber: "", rol: "COPIL" }]);
    setAdding(false);
    setChild({ prenume: "", nume: "", gen: "", dataNasterii: "" });
  }
  const surname = family ? (family.members[0]?.nume ?? family.name.replace(/^Fam\.\s*/, "").split(" ").pop() ?? "") : "";

  const checks = (list: { id: string; nume: string; prenume: string; dataNasterii: string | null }[], rol: EventPersonRole) => (
    <div className="event-checks">
      {list.map((m) => (
        <label key={m.id} className="check">
          <input type="checkbox" checked={has(m.id, rol)} onChange={(e) => toggle(m.id, rol, e.target.checked)} />
          <span className="min-w-0">
            {m.prenume} {m.nume}
            {m.dataNasterii ? <span className="hint inline"> · născut(ă) {m.dataNasterii.split("-").reverse().join(".")}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );

  const single = (rol: EventPersonRole, label: string, free: boolean) => {
    const current = chosen.find((p) => p.rol === rol);
    return (
      <div className="event-role">
        <PersonPicker
          name={`picker-${rol}`}
          label={label}
          people={people.map((p) => ({ id: p.id, name: p.name }))}
          sections={[]}
          emptyText={`${label}: nimeni ales.`}
          value={current?.personId ?? ""}
          onChange={(id) => setOne(rol, id ? { personId: id, numeLiber: "" } : null)}
        />
        {free ? (
          <TextField
            name={`liber-${rol}`}
            label={`sau ${label.toLowerCase()} din altă biserică (nume)`}
            value={current && !current.personId ? current.numeLiber : ""}
            onChange={(e) => setOne(rol, e.target.value ? { personId: null, numeLiber: e.target.value } : null)}
            autoComplete="off"
          />
        ) : null}
      </div>
    );
  };

  return (
    <fieldset className="card event-persons" aria-label="Persoanele evenimentului">
      <input type="hidden" name="familyId" value={kind === "nunta" ? "" : familyId} />
      <input type="hidden" name="persoane" value={JSON.stringify(sent)} />
      {kind === "binecuvantare" ? (
        <>
          <legend className="font-semibold">Familia și copilul</legend>
          {familyPicker("Familia", false)}
          {family ? (
            <>
              <p className="mb-2">Părinți: {family.parents.length ? family.parents.join(", ") : "—"}</p>
              {familyMinors(family.members, today).length ? checks(familyMinors(family.members, today), "COPIL") : <p className="hint">Familia nu are copii minori în registru.</p>}
              {!adding ? (
                <button type="button" className="btn mt-2" onClick={() => (setAdding(true), setChild((c) => ({ ...c, nume: c.nume || surname })))}>
                  + Copil nou în familie
                </button>
              ) : (
                <div className="event-new-child">
                  <div className="row2">
                    <TextField name="copilPrenume" label="Prenume" value={child.prenume} onChange={(e) => setChild({ ...child, prenume: e.target.value })} autoComplete="off" />
                    <TextField name="copilNume" label="Nume" value={child.nume} onChange={(e) => setChild({ ...child, nume: e.target.value })} autoComplete="off" />
                  </div>
                  <div className="row2">
                    <SelectField name="copilGen" label="Gen" value={child.gen} onChange={(e) => setChild({ ...child, gen: e.target.value })} emptyLabel="—" options={[{ value: "M", label: "Băiat" }, { value: "F", label: "Fată" }]} />
                    <TextField name="copilData" label="Data nașterii" type="date" value={child.dataNasterii} onChange={(e) => setChild({ ...child, dataNasterii: e.target.value })} />
                  </div>
                  {childError ? (
                    <p className="field-error" role="alert">
                      {childError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn" disabled={saving} onClick={addChild}>
                      {saving ? "Se adaugă…" : "Adaugă copilul în familie"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
                      Renunță
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
          <details className="mt-3">
            <summary>Caută copilul după nume</summary>
            <PersonPicker
              name="copilPicker"
              label="Copilul"
              people={people.map((p) => ({ id: p.id, name: p.name }))}
              sections={[]}
              emptyText="Alegerea unui copil completează singură familia."
              value=""
              onChange={(id) => {
                const p = byId.get(id);
                if (!p) return;
                if (p.familyId && p.familyId !== familyId) {
                  setFamilyId(p.familyId);
                  setChosen((c) => [...c.filter((x) => x.rol !== "COPIL" || byId.get(x.personId ?? "")?.familyId === p.familyId), { personId: id, numeLiber: "", rol: "COPIL" }]);
                } else toggle(id, "COPIL", true);
              }}
            />
          </details>
        </>
      ) : kind === "botez" ? (
        <>
          <legend className="font-semibold">Cine se botează</legend>
          {sent.length ? checks(sent.map((p) => byId.get(p.personId ?? "")).filter((p): p is EventPersonOption => Boolean(p)), "BOTEZAT") : <p className="hint">Nicio persoană aleasă.</p>}
          <PersonPicker name="botezPicker" label="Adaugă persoana" people={people.map((p) => ({ id: p.id, name: p.name }))} sections={[]} emptyText="Căutați persoana care se botează." value="" onChange={(id) => id && toggle(id, "BOTEZAT", true)} />
          <details className="mt-3">
            <summary>Familia (opțional): propune membrii ei</summary>
            {familyPicker("Familia", true)}
            {family ? checks(family.members, "BOTEZAT") : null}
          </details>
        </>
      ) : kind === "nunta" ? (
        <>
          <legend className="font-semibold">Mirii</legend>
          <div className="row2">
            {single("MIRE", "Mirele", true)}
            {single("MIREASA", "Mireasa", true)}
          </div>
        </>
      ) : kind === "inmormantare" ? (
        <>
          <legend className="font-semibold">Decedatul</legend>
          {single("DECEDAT", "Decedatul", false)}
          <p className="hint">Familia lui se completează singură.</p>
        </>
      ) : (
        <>
          <legend className="font-semibold">Familia (opțional)</legend>
          {familyPicker("Familia", true)}
        </>
      )}
      {sent.length && kind ? (
        <p className="hint mt-2">
          {sent.map((p) => `${EVENT_ROLE_LABEL[p.rol]}: ${p.personId ? (byId.get(p.personId)?.name ?? "") : p.numeLiber}`).join(" · ")}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
