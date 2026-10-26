"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PersonPicker } from "@/components/person-picker";
import type { FormState } from "@/lib/form-state";
import { addKinLinkAction, removeKinLinkAction } from "@/server/actions/kinship";
import type { KinEntry } from "@/server/kinship";

type Group = { key: string; title: string; entries: KinEntry[] };

/** One relative: name (link), what they are to this person, their family. */
function Row({ e, onRemove, pending }: { e: KinEntry; onRemove?: () => void; pending: boolean }) {
  return (
    <li>
      <Link href={`/persoane/${e.id}`} className="font-semibold">
        {e.name}
      </Link>
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
      {!e.active ? <span className="tag">nu mai este în evidență</span> : null}
      {onRemove ? (
        <button type="button" className="btn btn-sm" disabled={pending} onClick={onRemove} aria-label={`Șterge legătura cu ${e.name}`}>
          Șterge legătura
        </button>
      ) : null}
    </li>
  );
}

/** "+ Adaugă părinte / copil": pick a person of the register, then add. */
function AddLink({
  personId,
  kind,
  people,
  pending,
  run,
}: {
  personId: string;
  kind: "parinte" | "copil";
  people: { id: string; name: string; note?: string }[];
  pending: boolean;
  run: (f: () => Promise<FormState>, done?: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState("");
  const label = kind === "parinte" ? "Adaugă părinte" : "Adaugă copil";
  if (!open)
    return (
      <button type="button" className="btn btn-sm mt-2" onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  return (
    <div className="mt-2">
      <PersonPicker name={`kin-${kind}`} people={people} sections={[]} value={chosen} onChange={setChosen} label={label} emptyText="Nicio persoană aleasă." />
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" className="btn" disabled={!chosen || pending} onClick={() => run(() => addKinLinkAction(personId, kind, chosen), () => (setOpen(false), setChosen("")))}>
          {label}
        </button>
        <button type="button" className="btn" onClick={() => (setOpen(false), setChosen(""))}>
          Renunță
        </button>
      </div>
    </div>
  );
}

/**
 * "Rude în biserică": parents and children from the register (write roles add and remove them), then
 * the deduced relatives by group, each with a link and the family; the neam it belongs to.
 */
export function KinshipCard({ personId, groups, neam, people, canWrite }: { personId: string; groups: Group[]; neam: { id: string; name: string } | null; people: { id: string; name: string; note?: string }[]; canWrite: boolean }) {
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
  const [parents, children, ...rest] = groups;
  const edit = (g: Group, kind: "parinte" | "copil") => (
    <div>
      <h4 className="text-sm font-semibold mb-1">{g.title}</h4>
      {g.entries.length ? (
        <ul className="kin-list">
          {g.entries.map((e) => (
            <Row key={e.id} e={e} pending={pending} onRemove={canWrite && e.linkId ? () => run(() => removeKinLinkAction(e.linkId!)) : undefined} />
          ))}
        </ul>
      ) : (
        <p className="hint !mt-0">{kind === "parinte" ? "Niciun părinte în registru." : "Niciun copil în registru."}</p>
      )}
      {canWrite ? <AddLink personId={personId} kind={kind} people={people} pending={pending} run={run} /> : null}
    </div>
  );
  const others = rest.filter((g) => g.entries.length);
  return (
    <div className="card" id="rude">
      <h3>Rude în biserică</h3>
      {neam ? (
        <p className="hint !mt-0 mb-2">
          Face parte din{" "}
          <Link href={`/statistici/neamuri/${neam.id}`} className="underline">
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
        {edit(parents, "parinte")}
        {edit(children, "copil")}
        {others.map((g) => (
          <div key={g.key}>
            <h4 className="text-sm font-semibold mb-1">{g.title}</h4>
            <ul className="kin-list">
              {g.entries.map((e) => (
                <Row key={e.id} e={e} pending={pending} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
