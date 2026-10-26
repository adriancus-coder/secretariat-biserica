"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormState } from "@/lib/form-state";
import { confirmKinProposalAction, ignoreKinProposalAction, removeKinLinkAction } from "@/server/actions/kinship";

type Who = { id: string | null; name: string };
type Wrong = { id: string; parent: Who; child: Who; reason: string };

const person = (w: Who) =>
  w.id ? (
    <Link href={`/persoane/${w.id}#rude`} className="underline">
      {w.name}
    </Link>
  ) : (
    <>
      {w.name} <span className="tag">nu e în registru</span>
    </>
  );

/**
 * De verificat: the kinship to check. "Rudenie propusă după numele părinților" (Confirmă / Ignoră: nothing
 * is linked without a confirmation) and "Legături de rudenie de verificat" (links added by hand or from
 * the campaign that break the rules: never deleted automatically, "Șterge legătura" here).
 */
export function KinReview({ proposals, wrong }: { proposals: { key: string; text: string }[]; wrong: Wrong[] }) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (f: () => Promise<FormState>) =>
    start(async () => {
      const r = await f();
      setState(r);
      if (r.ok) router.refresh();
    });
  return (
    <>
      {state.message ? (
        <div className={`alert mt-4 ${state.ok ? "alert-ok" : ""}`} role="status">
          {state.message}
        </div>
      ) : null}
      {proposals.length ? (
        <section className="mt-6" aria-labelledby="rudenie-propusa">
          <h2 id="rudenie-propusa" className="text-base font-semibold mb-1">
            Rudenie propusă după numele părinților ({proposals.length})
          </h2>
          <p className="hint mb-3">Din numele tatălui și al mamei scrise pe fișe (Statut art. 14). Nimic nu se leagă fără „Confirmă”; „Ignoră” ascunde propunerea.</p>
          <ul className="list">
            {proposals.map((p) => (
              <li key={p.key} className="item kin-review-row">
                <span className="grow min-w-0">{p.text}</span>
                <span className="kin-review-actions">
                  <button type="button" className="btn" disabled={pending} onClick={() => run(() => confirmKinProposalAction(p.key))}>
                    Confirmă
                  </button>
                  <button type="button" className="btn" disabled={pending} onClick={() => run(() => ignoreKinProposalAction(p.key))}>
                    Ignoră
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {wrong.length ? (
        <section className="mt-6" aria-labelledby="rudenii-de-verificat">
          <h2 id="rudenii-de-verificat" className="text-base font-semibold mb-1">
            Legături de rudenie de verificat ({wrong.length})
          </h2>
          <p className="hint mb-3">Legături adăugate manual sau din campanie care încalcă regulile. Nu se șterg singure.</p>
          <ul className="list">
            {wrong.map((l) => (
              <li key={l.id} className="item kin-review-row">
                <span className="grow min-w-0">
                  <span className="block">
                    {person(l.parent)} → {person(l.child)} <span className="hint inline">(părinte → copil)</span>
                  </span>
                  <span className="hint block !mt-0">{l.reason}</span>
                </span>
                <span className="kin-review-actions">
                  <button type="button" className="btn" disabled={pending} onClick={() => run(() => removeKinLinkAction(l.id))} aria-label={`Șterge legătura ${l.parent.name} → ${l.child.name}`}>
                    Șterge legătura
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
