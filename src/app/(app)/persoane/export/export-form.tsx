"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/shell/icons";
import { DownloadForm, DownloadSubmit } from "@/components/ui/download";
import { MIME } from "@/lib/download";
import { CATEGORIES, CATEGORY_GROUPS } from "@/domain/categories";
import { EXPORT_COLUMNS, EXPORT_SORT_LABEL, EXPORT_SORTS, type ExportColumn, type ExportSort } from "@/lib/person-export";
import { exportCountAction } from "@/server/actions/person-export";

/** "1 persoană", "5 persoane", "41 de persoane". */
const persons = (n: number) => (n === 1 ? "1 persoană" : n % 100 >= 1 && n % 100 <= 19 ? `${n} persoane` : `${n} de persoane`);

export function ExportForm({
  initial,
  years,
  roles,
  needPassword,
  error,
}: {
  initial: { categorie: string[]; mod: "oricare" | "toate"; an: string; functie: string; coloane: ExportColumn[]; ordine: ExportSort };
  years: number[];
  roles: { id: string; nume: string; group: string }[];
  needPassword: boolean;
  error: string | null;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [cats, setCats] = useState<Set<string>>(() => new Set(initial.categorie));

  const recount = useCallback(async () => {
    if (!form.current) return;
    const res = await exportCountAction(new FormData(form.current));
    setCount("count" in res ? res.count : null);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void recount(), 250);
    return () => clearTimeout(t);
  }, [recount, cats]);

  return (
    <DownloadForm formRef={form} method="post" action="/api/persoane/export" filename="persoane.xlsx" mime={MIME.xlsx} personal onChange={() => void recount()} className="export-form">
      {error ? (
        <p className="alert mb-3" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset className="card">
        <legend className="font-semibold">Categorii</legend>
        {CATEGORY_GROUPS.map((g) => (
          <div key={g} className="mb-2">
            <h4 className="export-group">{g}</h4>
            <div className="export-grid">
              {CATEGORIES.filter((c) => c.group === g).map((c) => (
                <label key={c.key} className="choice">
                  <input
                    type="checkbox"
                    name="categorie"
                    value={c.key}
                    checked={cats.has(c.key)}
                    onChange={(e) => setCats((s) => (e.target.checked ? new Set(s).add(c.key) : new Set([...s].filter((x) => x !== c.key))))}
                  />
                  <span className="tick" aria-hidden="true">
                    <Icon name="bifa" className="size-[14px]" />
                  </span>
                  {c.label}
                </label>
              ))}
            </div>
            {g === "Slujire" ? (
              <label className="block mt-2">
                <span className="hint !mt-0 block">Pentru „Cu funcție sau slujire”: o anumită funcție (opțional)</span>
                <select name="functie" defaultValue={initial.functie}>
                  <option value="">oricare funcție sau slujire</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.group}: {r.nume}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ))}
        <div className="row2 stack-sm mt-2">
          <fieldset className="choices">
            <legend>Persoanele care sunt în</legend>
            {(
              [
                ["oricare", "oricare categorie"],
                ["toate", "toate categoriile alese"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="choice">
                <input type="radio" name="mod" value={v} defaultChecked={initial.mod === v} />
                <span className="tick" aria-hidden="true">
                  <Icon name="bifa" className="size-[14px]" />
                </span>
                {l}
              </label>
            ))}
          </fieldset>
          <label>
            <span className="font-medium block mb-1">Anul de referință</span>
            <select name="an" defaultValue={initial.an}>
              <option value="">Situația la zi</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="font-semibold">Coloane</legend>
        <div className="export-grid">
          {EXPORT_COLUMNS.map(([k, l]) => (
            <label key={k} className="choice">
              <input type="checkbox" name="coloane" value={k} defaultChecked={initial.coloane.includes(k)} />
              <span className="tick" aria-hidden="true">
                <Icon name="bifa" className="size-[14px]" />
              </span>
              {l}
            </label>
          ))}
        </div>
        <fieldset className="choices mt-3">
          <legend>Ordine</legend>
          {EXPORT_SORTS.map((s) => (
            <label key={s} className="choice">
              <input type="radio" name="ordine" value={s} defaultChecked={initial.ordine === s} />
              <span className="tick" aria-hidden="true">
                <Icon name="bifa" className="size-[14px]" />
              </span>
              {EXPORT_SORT_LABEL[s]}
            </label>
          ))}
        </fieldset>
      </fieldset>

      <div className="card">
        <p className="export-count" aria-live="polite">
          {count === null ? "Se calculează…" : `Se exportă ${persons(count)}.`}
        </p>
        {needPassword ? (
          <label className="block mb-3">
            <span className="font-medium block mb-1">Parola dumneavoastră</span>
            <span className="hint !mt-0 block mb-1">
              Lista conține date personale: parola se cere o dată la 10 minute (după primul export o puteți lăsa goală).
            </span>
            <input type="password" name="parola" autoComplete="current-password" />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <DownloadSubmit name="format" value="xlsx" className="btn btn-primary" disabled={!cats.size || count === 0} mime={MIME.xlsx} filename="persoane.xlsx">
            <Icon name="documente" className="size-[18px]" /> Descarcă Excel
          </DownloadSubmit>
          <DownloadSubmit name="format" value="csv" className="btn" disabled={!cats.size || count === 0} mime={MIME.csv} filename="persoane.csv">
            CSV
          </DownloadSubmit>
          <DownloadSubmit name="format" value="pdf" className="btn" disabled={!cats.size || count === 0} mime={MIME.pdf} filename="persoane.pdf">
            PDF
          </DownloadSubmit>
        </div>
      </div>
    </DownloadForm>
  );
}
