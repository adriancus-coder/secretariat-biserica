"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/shell/icons";
import { globalSearchAction, type SearchResponse } from "@/server/actions/search";

/*
 * GLOBAL-SEARCH: the search field. As the user types (250 ms after the last key, from 2 letters) it asks
 * the server and shows the groups (at most 5 hits each, „Vezi toate (N)”). Arrow keys move through the
 * hits, Enter opens the chosen one (or every result on /cautare), Escape closes. Rows ≥ 44 px.
 */

export const OPEN_SEARCH_EVENT = "deschide-cautarea";
const MIN = 2;
const DEBOUNCE = 250;

export function GlobalSearch({
  initial = "",
  autoFocus = false,
  variant = "inline",
  onNavigate,
}: {
  initial?: string;
  autoFocus?: boolean;
  /** "page": /cautare (Enter reloads the full results, no list under the field); "inline" / "dialog": live results. */
  variant?: "inline" | "dialog" | "page";
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState(initial);
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const live = variant !== "page";
  const trimmed = q.trim();

  useEffect(() => {
    // Under 2 letters nothing is asked (the list is hidden by `open`).
    if (!live || trimmed.length < MIN) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await globalSearchAction(trimmed);
      if (n === seq.current) {
        setRes(r);
        setActive(-1);
        setBusy(false);
      }
    }, DEBOUNCE);
    return () => clearTimeout(t);
  }, [trimmed, live]);

  const all = `/cautare?q=${encodeURIComponent(trimmed)}`;
  // Every link of the list, in order: the hits, each group's „Vezi toate”, and „Toate rezultatele”.
  const options: { href: string; key: string }[] = [];
  for (const g of res?.groups ?? []) {
    for (const h of g.items) options.push({ href: h.href, key: `${g.key}:${h.href}:${h.title}` });
    if (g.total > g.items.length) options.push({ href: `${all}&grup=${g.key}`, key: `${g.key}:all` });
  }
  if (res?.groups.length) options.push({ href: all, key: "all" });
  const indexOf = (key: string) => options.findIndex((o) => o.key === key);

  function go(href: string) {
    onNavigate?.();
    router.push(href);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && options[active]) go(options[active].href);
      else if (trimmed.length >= MIN) go(all);
    } else if (e.key === "Escape") {
      if (q) setQ("");
      else onNavigate?.();
    }
  }
  const optionId = (i: number) => `${id}-opt-${i}`;
  const open = live && trimmed.length >= MIN && res !== null;

  return (
    <div className={`gsearch gsearch-${variant}`}>
      <div className="gsearch-field">
        <Icon name="cauta" className="size-[18px]" />
        <input
          type="search"
          role="combobox"
          aria-label="Caută în aplicație"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          placeholder="Caută persoane, pagini, setări…"
          value={q}
          autoFocus={autoFocus}
          enterKeyHint="search"
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        {busy ? <span className="gsearch-busy" aria-hidden="true" /> : null}
      </div>
      {open ? (
        <div id={`${id}-list`} role="listbox" aria-label="Rezultatele căutării" className="gsearch-results">
          {res.message ? <p className="hint px-3">{res.message}</p> : null}
          {!res.groups.length && !res.message ? <p className="hint px-3">Niciun rezultat. Diacriticele nu contează.</p> : null}
          {res.groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label} className="gsearch-group">
              <div className="gsearch-group-title">
                {g.label} ({g.total})
              </div>
              {g.items.map((h) => {
                const i = indexOf(`${g.key}:${h.href}:${h.title}`);
                return (
                  <Link key={h.href + h.title} id={optionId(i)} role="option" aria-selected={i === active} href={h.href} className="gsearch-hit" onClick={() => onNavigate?.()}>
                    <span className="gsearch-t">{h.title}</span>
                    {h.subtitle ? <span className="gsearch-m">{h.subtitle}</span> : null}
                  </Link>
                );
              })}
              {g.total > g.items.length ? (
                <Link
                  id={optionId(indexOf(`${g.key}:all`))}
                  role="option"
                  aria-selected={indexOf(`${g.key}:all`) === active}
                  href={`${all}&grup=${g.key}`}
                  className="gsearch-hit gsearch-more"
                  onClick={() => onNavigate?.()}
                >
                  Vezi toate ({g.total})
                </Link>
              ) : null}
            </div>
          ))}
          {res.groups.length ? (
            <Link id={optionId(indexOf("all"))} role="option" aria-selected={indexOf("all") === active} href={all} className="gsearch-hit gsearch-more" onClick={() => onNavigate?.()}>
              Toate rezultatele pentru „{trimmed}”
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The sidebar's „Caută” button (from 820 px): opens the search dialog. */
export function SearchButton() {
  return (
    <button type="button" className="side-toggle side-search" title="Caută (Ctrl+K)" aria-label="Caută (Ctrl+K)" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}>
      <Icon name="cauta" />
      <span className="side-label">Caută</span>
      <kbd className="side-label gsearch-kbd">Ctrl K</kbd>
    </button>
  );
}

/** The search dialog: Ctrl+K / Cmd+K anywhere in the app, or the sidebar's button. */
export function SearchDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);
  if (!open) return null;
  return (
    <div className="gsearch-overlay" role="dialog" aria-modal="true" aria-label="Căutare" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="gsearch-panel">
        <GlobalSearch autoFocus variant="dialog" onNavigate={() => setOpen(false)} />
        <p className="hint !mt-2">
          ↑ ↓ pentru a alege, Enter pentru a deschide, Esc pentru a închide.
        </p>
      </div>
    </div>
  );
}
