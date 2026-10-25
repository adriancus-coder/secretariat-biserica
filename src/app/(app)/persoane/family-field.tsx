"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Field } from "@/components/ui/fields";
import { NEW_FAMILY } from "@/lib/families";
import { normalizeSearch } from "@/lib/text";

export interface FamilyChoice {
  id: string;
  label: string;
}

/**
 * The person's family: one of the church's families ("Fam. Daniel Mureșan (3)"), a new family
 * headed by this person, or none. A head whose family has other members cannot change it here.
 */
export function FamilyField({
  families,
  defaultValue,
  error,
  locked,
}: {
  families: FamilyChoice[];
  defaultValue: string;
  error?: string;
  /** Set when the person heads a family with other members. */
  locked?: { id: string; nume: string };
}) {
  const [value, setValue] = useState(defaultValue);
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => {
    const f = normalizeSearch(filter);
    return f ? families.filter((o) => o.id === value || normalizeSearch(o.label).includes(f)) : families;
  }, [filter, families, value]);

  if (locked) {
    return (
      <Field
        label="Familie"
        htmlFor="f-familyId"
        hint={
          <>
            Este capul familiei. Capul se schimbă din <Link href={`/familii/${locked.id}`}>pagina familiei</Link>.
          </>
        }
      >
        <input type="hidden" name="familyId" value={locked.id} />
        <select id="f-familyId" value={locked.id} disabled>
          <option value={locked.id}>{locked.nume}</option>
        </select>
      </Field>
    );
  }

  return (
    <Field label="Familie" htmlFor="f-familyId" error={error}>
      {families.length > 8 ? (
        <input
          type="search"
          placeholder="Caută familia…"
          aria-label="Caută familia"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-2"
        />
      ) : null}
      <select
        id="f-familyId"
        name="familyId"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={error ? true : undefined}
      >
        <option value="">— fără familie —</option>
        <option value={NEW_FAMILY}>Familie nouă (această persoană este cap de familie)</option>
        {visible.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
