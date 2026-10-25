"use client";

import { useState, useTransition } from "react";
import { deletePersonAliasAction } from "@/server/actions/person-aliases";

/** "Alte forme ale numelui": names matched to this person by hand when importing minutes. */
export function PersonAliases({ aliases, canWrite }: { aliases: { id: string; alias: string }[]; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="card">
      <h3>Alte forme ale numelui</h3>
      <p className="hint mb-2">Nume scrise altfel în procesele-verbale importate, potrivite cu această persoană.</p>
      <ul>
        {aliases.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 py-1 border-b border-line last:border-0">
            <span className="capitalize">{a.alias}</span>
            {canWrite ? (
              <button
                type="button"
                className="btn"
                disabled={pending}
                aria-label={`Șterge forma „${a.alias}”`}
                onClick={() =>
                  startTransition(async () => {
                    setError("");
                    const r = await deletePersonAliasAction(a.id);
                    if (r.message && !r.ok) setError(r.message);
                  })
                }
              >
                Șterge
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-xs text-warn mt-1">
          {error}
        </p>
      ) : null}
    </div>
  );
}
