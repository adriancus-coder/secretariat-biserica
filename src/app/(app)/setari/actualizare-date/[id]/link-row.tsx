"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icons";
import { CopyButton } from "@/components/ui/copy-button";
import { ShareButton } from "@/components/ui/share-button";
import { LINK_STATUS_LABEL, type LinkStatus } from "@/lib/campaign";
import type { FormState } from "@/lib/form-state";
import { fmt } from "@/lib/format";
import { whatsappDirectUrl } from "@/lib/phone";
import { linkWhatsappAction, markLinkSentAction, renewLinkAction, unmarkLinkSentAction } from "@/server/actions/campaigns";

export const RENEW_CONFIRM = "Linkul trimis deja nu va mai funcționa. Continuați?";
const ANSWERED: readonly LinkStatus[] = ["COMPLETAT", "APROBAT"];

export interface LinkRowData {
  id: string;
  personId: string;
  name: string;
  telefon: string;
  status: LinkStatus;
  sentOn: string | null;
  submissionId: string | null;
}

/** "Netrimis" / "Trimis 12 oct 2026" / "A răspuns" (and Deschis, Verificat, Blocat as they are). */
function statusText(r: LinkRowData): string {
  if (ANSWERED.includes(r.status)) return "A răspuns";
  if (r.status === "TRIMIS" && r.sentOn) return `Trimis ${fmt(r.sentOn)}`;
  return LINK_STATUS_LABEL[r.status];
}

/**
 * One adult of the campaign: the name, the status, the main action ("Trimite pe WhatsApp" straight to
 * the person's number, or "Vezi răspunsul") and "⋯" with the rest. Back from WhatsApp the row asks
 * "Ați trimis?"; nothing is marked by itself.
 */
export function LinkRow({ row, message, open }: { row: LinkRowData; message: string; open: boolean }) {
  const [menu, setMenu] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [ask, setAsk] = useState(false);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const away = useRef(false);
  const menuId = useId();
  const wa = whatsappDirectUrl(row.telefon, message);
  const answered = ANSWERED.includes(row.status) && row.submissionId;
  const canMark = row.status === "NETRIMIS";

  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible" && away.current) {
        away.current = false;
        if (canMark) setAsk(true);
      }
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [canMark]);

  const run = (action: (id: string) => Promise<FormState>, after?: () => void) =>
    start(async () => {
      const r = await action(row.id);
      setState(r.ok ? {} : r);
      if (r.ok) after?.();
    });
  const sentOnWhatsapp = () => {
    away.current = true;
    void linkWhatsappAction(row.id);
    // A new tab may not hide this one: ask after a moment as well.
    if (canMark) setTimeout(() => setAsk(true), 1500);
  };

  return (
    <li className="item campaign-row">
      <div className="campaign-who">
        <Link href={`/persoane/${row.personId}`} className="font-bold">
          {row.name}
        </Link>
        <span className={row.status === "BLOCAT" ? "tag tag-warn" : ANSWERED.includes(row.status) ? "tag tag-ok" : "tag"}>{statusText(row)}</span>
        {!row.telefon.trim() && !answered ? <span className="hint block w-full !mt-0">fără telefon — nu poate trece verificarea; folosiți hârtia sau completați telefonul</span> : null}
      </div>

      {answered || open ? (
        <div className="campaign-actions">
          {answered ? (
            <Link href={`/de-verificat/${row.submissionId}`} className="btn btn-primary">
              Vezi răspunsul
            </Link>
          ) : wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary" onClick={sentOnWhatsapp}>
              Trimite pe WhatsApp
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              Lipsește telefonul
            </button>
          )}
          {open ? (
            <button
              type="button"
              className="btn campaign-more"
              aria-label={`Mai multe acțiuni pentru ${row.name}`}
              aria-expanded={menu}
              aria-controls={menuId}
              onClick={() => {
                setMenu((m) => !m);
                setConfirmRenew(false);
              }}
            >
              ⋯
            </button>
          ) : null}
        </div>
      ) : null}

      {ask && canMark ? (
        <div className="alert alert-ok campaign-ask" role="status">
          <span>Ați trimis?</span>
          <button type="button" className="btn" disabled={pending} onClick={() => run(markLinkSentAction, () => setAsk(false))}>
            <Icon name="bifa" className="size-[18px]" /> Marchează ca trimis
          </button>
        </div>
      ) : null}

      {open && menu ? (
        <div id={menuId} className="campaign-menu" role="group" aria-label={`Acțiuni pentru ${row.name}`} onKeyDown={(e) => e.key === "Escape" && setMenu(false)}>
          {confirmRenew ? (
            <div className="alert campaign-confirm" role="alertdialog" aria-label="Generează link nou">
              <p className="!m-0">{RENEW_CONFIRM}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" disabled={pending} onClick={() => run(renewLinkAction, () => (setConfirmRenew(false), setMenu(false)))}>
                  Da, generează link nou
                </button>
                <button type="button" className="btn" autoFocus onClick={() => setConfirmRenew(false)}>
                  Renunță
                </button>
              </div>
            </div>
          ) : (
            <>
              <CopyButton text={message} label="Copiază mesajul" className="btn" />
              <ShareButton title="Actualizarea datelor" text={message} className="btn" />
              {canMark ? (
                <button type="button" className="btn" disabled={pending} onClick={() => run(markLinkSentAction, () => setMenu(false))}>
                  Marchează ca trimis
                </button>
              ) : row.status === "TRIMIS" ? (
                <button type="button" className="btn" disabled={pending} onClick={() => run(unmarkLinkSentAction, () => setMenu(false))}>
                  Anulează marcarea
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => setConfirmRenew(true)}>
                {row.status === "BLOCAT" ? "Deblochează / generează link nou" : "Generează link nou"}
              </button>
            </>
          )}
        </div>
      ) : null}

      {state.message ? (
        <p className="field-error campaign-error" role="alert">
          {state.message}
        </p>
      ) : null}
    </li>
  );
}
