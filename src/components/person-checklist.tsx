"use client";

import { useMemo, useState } from "react";
import { normalizeSearch } from "@/lib/text";

export interface ChecklistOption {
  id: string;
  name: string;
  /** Mențiune afișată lângă nume (ex. „ieșit din evidență”). */
  note?: string;
}

/**
 * Listă de persoane cu casete de bifat (prezenți la ședință, membrii unui grup), cu filtru
 * rapid și butoane „Bifează toți / Debifează”. Valorile se trimit în formular sub `name`.
 */
export function PersonChecklist({
  name,
  options,
  defaultSelected,
  emptyText = "Adăugați întâi persoane în registru.",
}: {
  name: string;
  options: ChecklistOption[];
  defaultSelected: string[];
  emptyText?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => {
    const f = normalizeSearch(filter);
    return f ? options.filter((o) => normalizeSearch(o.name).includes(f)) : options;
  }, [filter, options]);

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function setAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of visible) {
        if (on) next.add(o.id);
        else next.delete(o.id);
      }
      return next;
    });
  }

  return (
    <div>
      {options.length > 8 ? (
        <input
          type="search"
          placeholder="Filtrează…"
          aria-label="Filtrează persoanele"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-2"
        />
      ) : null}
      <div className="checklist" role="group">
        {visible.length ? (
          visible.map((o) => (
            <label key={o.id} className="check">
              <input type="checkbox" checked={selected.has(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
              <span>
                {o.name}
                {o.note ? <span className="hint inline"> · {o.note}</span> : null}
              </span>
            </label>
          ))
        ) : (
          <div className="hint py-2.5">{options.length ? "Niciun rezultat." : emptyText}</div>
        )}
      </div>
      {/* Valorile efectiv trimise includ și persoanele bifate ascunse de filtru. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className="flex gap-2 mt-1.5 items-center flex-wrap">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAll(true)}>
          Bifează toți
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAll(false)}>
          Debifează
        </button>
        <span className="hint !mt-0">{selected.size} selectate</span>
      </div>
    </div>
  );
}
