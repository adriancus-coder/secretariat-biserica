"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icons";
import type { FormState } from "@/lib/form-state";
import { PRAYER_SHARE_HINT, PRAYER_SHARE_MAX, whatsappUrl } from "@/lib/prayer";
import { cancelPrayerWeekAction, markPrayerWeekAction, prayerSharedAction, type PrayerShareChannel } from "@/server/actions/prayer";

/**
 * The edited message lives only in this browser tab (sessionStorage), for this week and this family:
 * it may hold personal details, so it never goes to the server and never into the audit log.
 */
const STORE = "rugaciune-mesaj";
type Draft = { week: string; unit: string; text: string };
function readDraft(week: string, unit: string): string | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Draft | null;
    return d && d.week === week && d.unit === unit ? d.text : null;
  } catch {
    return null;
  }
}
function writeDraft(d: Draft | null) {
  try {
    if (d) sessionStorage.setItem(STORE, JSON.stringify(d));
    else sessionStorage.removeItem(STORE);
  } catch {
    /* private mode: the text simply is not remembered */
  }
}

/**
 * "Familia săptămânii": the message (prefilled from the church's model, editable, up to 1000
 * characters), sent by WhatsApp, the phone's share sheet or the clipboard; then, back in the app,
 * "Ați trimis mesajul? Marchează ca anunțată" (never marked automatically).
 */
export function PrayerWeekCard({
  week,
  unitKey,
  label,
  nextKey,
  marked,
  skipHref,
  message,
}: {
  week: string;
  /** The shown family (marked or next): the draft belongs to it. */
  unitKey: string | null;
  label: string | null;
  nextKey: string | null;
  marked: boolean;
  skipHref: string | null;
  /** The church's model with {familia} filled in. */
  message: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  const [text, setText] = useState(message);
  const [canShare, setCanShare] = useState(false);
  const [askMark, setAskMark] = useState(false);
  const away = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // The draft of this week and family, else the model (a new family starts from the model again).
  useEffect(() => {
    if (!unitKey) return;
    const saved = readDraft(week, unitKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
    setText(saved ?? message);
    if (saved === null) writeDraft(null);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [week, unitKey, message]);

  // Back from WhatsApp or the share sheet: ask whether it was sent (only while not marked).
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible" && away.current) {
        away.current = false;
        if (!marked && nextKey) setAskMark(true);
      }
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [marked, nextKey]);

  const edit = (v: string) => {
    const t = v.slice(0, PRAYER_SHARE_MAX);
    setText(t);
    if (unitKey) writeDraft(t === message ? null : { week, unit: unitKey, text: t });
  };
  const logChannel = (channel: PrayerShareChannel) => void prayerSharedAction(channel);
  const sent = (channel: "whatsapp" | "share") => {
    away.current = true;
    logChannel(channel);
    // Opening WhatsApp in a new tab may not hide this one: ask right away as well.
    if (channel === "whatsapp" && !marked && nextKey) setTimeout(() => setAskMark(true), 1500);
  };
  const share = async () => {
    try {
      away.current = true;
      await navigator.share({ text });
      logChannel("share");
      if (!marked && nextKey) setAskMark(true);
    } catch (e) {
      away.current = false;
      // Closing the share sheet is not an error.
      if ((e as Error)?.name !== "AbortError") setState({ message: "Mesajul nu a putut fi partajat. Folosiți „Copiază mesajul”." });
    }
  };
  const copy = () =>
    start(async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        // Safari without clipboard permission: select the text and copy the selection.
        const el = area.current;
        if (el) {
          el.focus();
          el.select();
          el.setSelectionRange(0, el.value.length);
          try {
            ok = document.execCommand("copy");
          } catch {
            ok = false;
          }
        }
      }
      setState(
        ok
          ? { ok: true, message: "Mesajul a fost copiat. Îl puteți lipi în grupul bisericii." }
          : { message: "Textul este selectat: copiați-l din meniul telefonului (Copiază)." },
      );
      if (ok) logChannel("copy");
    });
  const mark = () =>
    start(async () => {
      if (!nextKey) return;
      const r = await markPrayerWeekAction(nextKey);
      setState(r);
      if (r.ok) {
        writeDraft(null);
        setAskMark(false);
      }
    });

  if (!label) {
    return (
      <section className="card">
        <h3>Familia săptămânii</h3>
        <p className="hint">Nu există nicio familie în rotație.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-live="polite">
      <h3>Familia săptămânii</h3>
      <p className="prayer-family">{label}</p>
      {marked ? (
        <p className="hint !mt-1">
          <Icon name="bifa" className="inline size-[16px] align-[-3px]" /> Anunțată săptămâna aceasta.
        </p>
      ) : null}
      <div className="field mt-3">
        <label htmlFor="prayer-message">Mesajul pentru grup</label>
        <textarea id="prayer-message" ref={area} value={text} maxLength={PRAYER_SHARE_MAX} rows={5} onChange={(e) => edit(e.target.value)} aria-describedby="prayer-message-hint" />
        <div id="prayer-message-hint" className="prayer-message-foot">
          <span className="hint !mt-0">{PRAYER_SHARE_HINT}</span>
          <span className="hint !mt-0 tabular-nums" aria-live="polite">
            {text.length} / {PRAYER_SHARE_MAX}
          </span>
        </div>
        {text !== message ? (
          <button type="button" className="btn mt-2" onClick={() => edit(message)}>
            Revino la model
          </button>
        ) : null}
      </div>
      {state.message ? (
        <div className={`alert mt-3 ${state.ok ? "alert-ok" : ""}`} role="status">
          {state.message}
        </div>
      ) : null}
      {askMark && !marked && nextKey ? (
        <div className="alert alert-ok mt-3 prayer-ask" role="status">
          <span>Ați trimis mesajul?</span>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={mark}>
            <Icon name="bifa" className="size-[18px]" /> Marchează ca anunțată
          </button>
        </div>
      ) : null}
      <div className="prayer-share">
        <a className="btn" href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer" onClick={() => sent("whatsapp")}>
          Trimite pe WhatsApp
        </a>
        {canShare ? (
          <button type="button" className="btn" onClick={share}>
            Partajează
          </button>
        ) : null}
        <button type="button" className="btn" disabled={pending} onClick={copy}>
          Copiază mesajul
        </button>
      </div>
      <div className="actions">
        {marked ? (
          <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setState(await cancelPrayerWeekAction()))}>
            Anulează marcarea
          </button>
        ) : nextKey && !askMark ? (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={mark}>
            <Icon name="bifa" className="size-[18px]" /> Marchează ca anunțată
          </button>
        ) : null}
        {!marked && skipHref ? (
          <Link href={skipHref} className="btn">
            Sari peste
          </Link>
        ) : null}
      </div>
    </section>
  );
}
