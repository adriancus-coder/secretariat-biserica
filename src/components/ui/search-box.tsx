"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Câmp de căutare care actualizează parametrul `q` din URL (cu întârziere de 300 ms),
 * păstrând ceilalți parametri și revenind la prima pagină.
 */
export function SearchBox({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(param) ?? "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (next.trim()) sp.set(param, next);
      else sp.delete(param);
      sp.delete("pagina");
      startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
    }, 300);
  }

  return (
    <input
      type="search"
      name={param}
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => update(e.target.value)}
      aria-busy={pending || undefined}
      autoComplete="off"
    />
  );
}
