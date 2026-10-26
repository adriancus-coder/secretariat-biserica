"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PersonPicker } from "@/components/person-picker";
import type { FormState } from "@/lib/form-state";
import { addKinLinkAction, addSiblingAction, removeKinLinkAction, removeSiblingLinkAction, type SiblingState } from "@/server/actions/kinship";
import type { KinEntry, PickerPerson } from "@/server/kinship";

type Group = { key: string; title: string; entries: KinEntry[] };

/** One relative: name (link), what they are to this person, their family. */
function Row({ e, onRemove, removeLabel = "Șterge legătura", pending }: { e: KinEntry; onRemove?: () => void; removeLabel?: string; pending: boolean }) {
  return (
    <li>
      {e.external ? (
        <span className="font-semibold">{e.name}</span>
      ) : (
        <Link href={`/persoane/${e.id}`} className="font-semibold">
          {e.name}
        </Link>
      )}
      <span className="hint !mt-0">
        {e.label}
        {e.family ? (
          <>
            {" · "}
            <Link href={`/familii/${e.family.id}`} className="underline">
              {e.family.name}
            </Link>
          </>
        ) : null}
      </span>
      {e.external ? <span className="tag">nu e în registru</span> : null}
      {e.source ? <span className="tag">{e.source}</span> : null}
      {!e.active && !e.external ? <span className="tag">nu mai este în evidență</span> : null}
      {onRemove ? (
        <button type="button" className="btn btn-sm" disabled={pending} onClick={onRemove} aria-label={`${removeLabel} cu ${e.name}`}>
          {removeLabel}
        </button>
      ) : null}
    </li>
  );
}

/** "+ Adaugă părinte": pick a person of the register (a head of another family), then add. */
function AddParent({ personId, people, pending, run }: { personId: string; people: PickerPerson[]; pending: boolean; run: (f: () => Promise<FormState>, done?: () => void) => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState("");
  if (!open)
    return (
      <button type="button" className="btn btn-sm mt-2" onClick={() => setOpen(true)}>
        + Adaugă părinte
      </button>
    );
  return (
    <div className="mt-2">
      <PersonPicker name="kin-parinte" people={people} sections={[]} value={chosen} onChange={setChosen} label="Adaugă părinte" emptyText="Nicio persoană aleasă." />
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" className="btn" disabled={!chosen || pending} onClick={() => run(() => addKinLinkAction(personId, "parinte", chosen), () => (setOpen(false), setChosen("")))}>
          Adaugă părinte
        </button>
        <button type="button" className="btn" onClick={() => (setOpen(false), setChosen(""))}>
          Renunță
        </button>
      </div>
    </div>
  );
}

/**
 * "+ Adaugă frate / soră": pick a person, then the server answers with what it will do (link to the
 * other's parents, or parents outside the register by the names on the files); the parents' names are
 * asked only when neither file has them, and nothing is written before "Confirmă".
 */
function AddSibling({ personId, people, onDone }: { personId: string; people: PickerPerson[]; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState("");
  const [state, setState] = useState<SiblingState>({});
  const [names, setNames] = useState({ tata: "", mama: "" });
  const [pending, start] = useTransition();
  const reset = () => (setOpen(false), setChosen(""), setState({}), setNames({ tata: "", mama: "" }));
  const ask = state.plan?.kind === "ask";
  const typed = Boolean(names.tata.trim() || names.mama.trim());
  const call = (confirm: boolean) =>
    start(async () => {
      const r = await addSiblingAction(personId, chosen, confirm, typed ? names : undefined);
      if (confirm && r.ok) {
        reset();
        onDone(r.message ?? "");
      } else setState(r);
    });
  if (!open)
    return (
      <button type="button" className="btn btn-sm mt-2" onClick={() => setOpen(true)}>
        + Adaugă frate / soră
      </button>
    );
  return (
    <div className="mt-2">
      {state.plan ? null : (
        <PersonPicker name="kin-frate" people={people} sections={[]} value={chosen} onChange={(v) => (setChosen(v), setState({}))} label="Adaugă frate / soră" emptyText="Nicio persoană aleasă." />
      )}
      {!state.ok && state.message ? (
        <div className="alert mt-2" role="alert">
          {state.message}
        </div>
      ) : null}
      {state.plan ? (
        <div className="alert mt-2" role="status">
          {state.plan.text}
        </div>
      ) : null}
      {ask ? (
        <div className="mt-2">
          <div className="row2">
            <div className="field">
              <label htmlFor="kin-tata">Numele tatălui</label>
              <input id="kin-tata" value={names.tata} maxLength={200} onChange={(e) => setNames({ ...names, tata: e.target.value })} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="kin-mama">Numele mamei</label>
              <input id="kin-mama" value={names.mama} maxLength={200} onChange={(e) => setNames({ ...names, mama: e.target.value })} autoComplete="off" />
            </div>
          </div>
          <p className="hint !mt-0">Nume și prenume, cerute de Statutul Cultului, art. 14.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 mt-2">
        {state.plan && !ask ? (
          <button type="button" className="btn" disabled={pending} onClick={() => call(true)}>
            Confirmă
          </button>
        ) : (
          <button type="button" className="btn" disabled={!chosen || pending || (ask && !typed)} onClick={() => call(false)}>
            Continuă
          </button>
        )}
        <button type="button" className="btn" onClick={reset}>
          Renunță
        </button>
      </div>
    </div>
  );
}

/**
 * "Rude în biserică": parents (write roles add and remove them), children (read only: they are added
 * through the family), siblings (write roles add them and remove a link added by hand), then the
 * deduced relatives by group, each with a link and the family; the neam it belongs to.
 */
export function KinshipCard({
  personId,
  groups,
  neam,
  pickParent,
  pickSibling,
  canWrite,
}: {
  personId: string;
  groups: Group[];
  neam: { id: string; name: string } | null;
  pickParent: PickerPerson[];
  pickSibling: PickerPerson[];
  canWrite: boolean;
}) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (f: () => Promise<FormState>, done?: () => void) =>
    start(async () => {
      const r = await f();
      setState(r);
      if (!r.ok) return;
      done?.();
      router.refresh();
    });
  const [parents, children, siblings, ...rest] = groups;
  const list = (g: Group, remove?: (e: KinEntry) => (() => void) | undefined, removeLabel?: string) => (
    <ul className="kin-list">
      {g.entries.map((e) => (
        <Row key={e.id} e={e} pending={pending} onRemove={remove?.(e)} removeLabel={removeLabel} />
      ))}
    </ul>
  );
  const others = rest.filter((g) => g.entries.length);
  return (
    <div className="card" id="rude">
      <h3>Rude în biserică</h3>
      {neam ? (
        <p className="hint !mt-0 mb-2">
          Face parte din{" "}
          <Link href={`/statistici/neamuri/${encodeURIComponent(neam.id)}`} className="underline">
            {neam.name}
          </Link>
          .
        </p>
      ) : null}
      {state.message ? (
        <div className={`alert ${state.ok ? "alert-ok" : ""}`} role="status">
          {state.message}
        </div>
      ) : null}
      <div className="grid gap-4">
        <div>
          <h4 className="text-sm font-semibold mb-1">{parents.title}</h4>
          {parents.entries.length ? list(parents, (e) => (canWrite && e.linkId ? () => run(() => removeKinLinkAction(e.linkId!)) : undefined)) : <p className="hint !mt-0">Niciun părinte în registru.</p>}
          {canWrite ? <AddParent personId={personId} people={pickParent} pending={pending} run={run} /> : null}
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-1">{children.title}</h4>
          {children.entries.length ? list(children) : <p className="hint !mt-0">Copiii se adaugă din familie, cu „+ Membru de familie”.</p>}
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-1">{siblings.title}</h4>
          {siblings.entries.length ? (
            list(siblings, (e) => (canWrite && e.siblingRemovable ? () => run(() => removeSiblingLinkAction(personId, e.id)) : undefined), "Șterge legătura de frate")
          ) : (
            <p className="hint !mt-0">Niciun frate sau soră în registru.</p>
          )}
          {canWrite ? <AddSibling personId={personId} people={pickSibling} onDone={(message) => (setState({ ok: true, message }), router.refresh())} /> : null}
        </div>
        {others.map((g) => (
          <div key={g.key}>
            <h4 className="text-sm font-semibold mb-1">{g.title}</h4>
            {list(g)}
          </div>
        ))}
      </div>
    </div>
  );
}
