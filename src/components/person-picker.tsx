"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/shell/icons";
import { normalizeSearch } from "@/lib/text";

export interface PickerSection {
  title: string;
  ids: string[];
}

/**
 * Picks one person of the register, with a search box and the suggestions first: the sections are
 * shown in order, each person once (in the first section that lists them), then "Toate persoanele".
 * The chosen id travels in the hidden input `name` ("" = nobody).
 */
export function PersonPicker({
  name,
  people,
  sections,
  value,
  onChange,
  label,
}: {
  name: string;
  people: { id: string; name: string; note?: string }[];
  sections: PickerSection[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const groups = useMemo(() => {
    const seen = new Set<string>();
    const f = normalizeSearch(q);
    const match = (id: string) => !f || normalizeSearch(byId.get(id)?.name ?? "").includes(f);
    const out = [...sections, { title: "Toate persoanele", ids: people.map((p) => p.id) }].map((s) => {
      const ids = s.ids.filter((id) => byId.has(id) && !seen.has(id));
      ids.forEach((id) => seen.add(id));
      return { title: s.title, ids: ids.filter(match) };
    });
    return out.filter((s) => s.ids.length);
  }, [q, sections, people, byId]);
  const chosen = value ? byId.get(value) : undefined;

  const row = (id: string, text: string, note?: string) => {
    const on = value === id;
    return (
      <button key={id || "none"} type="button" role="option" aria-selected={on} className="picker-row" onClick={() => onChange(id)}>
        <span className="tick" aria-hidden="true">
          {on ? <Icon name="bifa" className="size-[14px]" /> : null}
        </span>
        <span className="min-w-0">
          {text}
          {note ? <span className="hint inline"> · {note}</span> : null}
        </span>
      </button>
    );
  };

  return (
    <div className="picker">
      <input type="hidden" name={name} value={value} />
      <p className="picker-current" aria-live="polite">
        {chosen ? <>Ales: <strong>{chosen.name}</strong></> : "Niciun responsabil ales."}
      </p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nume…" aria-label={`Caută: ${label}`} />
      <div className="picker-list" role="listbox" aria-label={label}>
        {!q ? row("", "— niciunul —") : null}
        {groups.map((s) => (
          <div key={s.title} role="group" aria-label={s.title}>
            <div className="picker-section">{s.title}</div>
            {s.ids.map((id) => row(id, byId.get(id)!.name, byId.get(id)!.note))}
          </div>
        ))}
        {q && !groups.length ? <p className="hint px-2">Nicio persoană găsită.</p> : null}
      </div>
    </div>
  );
}
