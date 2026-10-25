"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** A select that sets one URL parameter (keeping the others, back to page 1). An empty value removes it. */
export function ParamSelect({
  param,
  label,
  options,
  emptyLabel,
}: {
  param: string;
  label: string;
  /** Options with a `group` are shown under that heading (optgroup), in order of appearance. */
  options: { value: string; label: string; group?: string }[];
  emptyLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = params.get(param) ?? "";
  return (
    <select
      aria-label={label}
      value={options.some((o) => o.value === current) ? current : ""}
      aria-busy={pending || undefined}
      onChange={(e) => {
        const sp = new URLSearchParams(params.toString());
        if (e.target.value) sp.set(param, e.target.value);
        else sp.delete(param);
        sp.delete("pagina");
        startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
      }}
    >
      <option value="">{emptyLabel}</option>
      {groupOptions(options).map(([group, list]) =>
        group ? (
          <optgroup key={group} label={group}>
            {list.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          list.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}

function groupOptions<O extends { group?: string }>(options: O[]): [string, O[]][] {
  const out: [string, O[]][] = [];
  for (const o of options) {
    const g = o.group ?? "";
    const last = out[out.length - 1];
    if (last && last[0] === g) last[1].push(o);
    else out.push([g, [o]]);
  }
  return out;
}
