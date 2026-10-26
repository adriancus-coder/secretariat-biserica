"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DataTable } from "@/components/ui/data-table";
import { fmt } from "@/lib/format";
import { rotationOrderLabel } from "@/lib/prayer";
import { normalizeSearch, searchTerms } from "@/lib/text";
import { choosePrayerFamilyAction } from "@/server/actions/prayer";

export interface OverviewRow {
  key: string;
  label: string;
  last: string | null;
  order: number;
}

/**
 * "Toate familiile": the rotation in its order, only the shown names (children's first names only with
 * consent), the last announcement and the place in the order; a search that ignores diacritics. "Alege
 * săptămâna aceasta" proposes a family for this week (audited without the name, nothing marked); the
 * page then shows it and its message. A table from 600 px, a list on phones.
 */
export function PrayerOverview({ rows, shownKey, canChoose }: { rows: OverviewRow[]; shownKey: string | null; canChoose: boolean }) {
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const terms = searchTerms(q);
  const shown = rows.filter((r) => terms.every((t) => normalizeSearch(r.label).includes(t)));
  const choose = (key: string) =>
    start(async () => {
      setError("");
      const r = await choosePrayerFamilyAction(key);
      if (!r.ok) return setError(r.message ?? "Nu s-a putut alege familia.");
      router.push(`/rugaciune?alege=${encodeURIComponent(key)}`);
      window.scrollTo({ top: 0 });
    });
  const button = (r: OverviewRow) =>
    r.key === shownKey ? (
      <span className="tag tag-ok">Propusă acum</span>
    ) : canChoose ? (
      <button type="button" className="btn" disabled={pending} onClick={() => choose(r.key)}>
        Alege săptămâna aceasta
      </button>
    ) : null;
  const last = (r: OverviewRow) => (r.last ? fmt(r.last) : "Niciodată");

  return (
    <section className="card" aria-labelledby="toate-familiile">
      <h3 id="toate-familiile">Toate familiile</h3>
      <div className="field">
        <label htmlFor="cauta-familie">Caută familia</label>
        <input id="cauta-familie" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      {error ? (
        <div className="alert mt-2" role="alert">
          {error}
        </div>
      ) : null}
      <p className="hint" aria-live="polite">
        {shown.length === rows.length ? `${rows.length} în rotație` : `${shown.length} din ${rows.length}`}
      </p>
      {shown.length ? (
        <>
          <div className="prayer-overview-table">
            <DataTable
              id="rotatie"
              caption="Toate familiile din rotație"
              defaultSort={{ col: "ordine", dir: "asc" }}
              columns={[
                { key: "nume", label: "Nume", type: "text" },
                { key: "ultima", label: "Ultima pomenire", type: "date" },
                { key: "ordine", label: "Ordine", type: "number" },
                { key: "alege", label: "Săptămâna aceasta", type: "text" },
              ]}
              rows={shown.map((r) => ({ key: r.key, sort: [r.label, r.last, r.order, ""], cells: [r.label, last(r), rotationOrderLabel(r.order), button(r)] }))}
            />
          </div>
          <ul className="list prayer-overview-list">
            {shown.map((r) => (
              <li key={r.key} className="item">
                <div className="body">
                  <div className="t">{r.label}</div>
                  <div className="m">
                    {rotationOrderLabel(r.order)} · ultima pomenire: {last(r)}
                  </div>
                </div>
                {button(r)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">Nicio familie găsită.</p>
      )}
    </section>
  );
}
