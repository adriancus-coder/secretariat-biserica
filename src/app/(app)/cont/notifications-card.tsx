"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isIos, isStandalone } from "@/components/pwa/pwa-store";
import type { FormState } from "@/lib/form-state";
import { PUSH_TYPE_LABEL, type PushType } from "@/lib/push";
import { removePushAction, setPushTypesAction, subscribePushAction, testPushAction } from "@/server/actions/push";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Cont → Notificări: this device on / off (the browser asks for permission only on the click), the
 * types the user wants, the devices that receive them, and a test notification.
 */
export function NotificationsCard({
  publicKey,
  types,
  off,
  devices,
}: {
  publicKey: string;
  types: PushType[];
  off: PushType[];
  devices: { id: string; label: string; added: string; lastOk: string | null }[];
}) {
  const router = useRouter();
  const [env, setEnv] = useState<{ supported: boolean; iosBrowser: boolean; permission: string } | null>(null);
  const [msg, setMsg] = useState<FormState | null>(null);
  const [pending, start] = useTransition();
  const [offState, setOff] = useState<PushType[]>(off);
  useEffect(() => {
    const t = setTimeout(
      () =>
        setEnv({
          supported: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
          // On iPhone / iPad, Web Push works only in the app installed on the home screen (iOS 16.4+).
          iosBrowser: isIos() && !isStandalone(),
          permission: "Notification" in window ? Notification.permission : "default",
        }),
      0,
    );
    return () => clearTimeout(t);
  }, []);
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) router.refresh();
    });
  const enable = () =>
    run(async () => {
      if ((await Notification.requestPermission()) !== "granted") return { ok: false, message: "Notificările nu au fost permise. Le puteți permite din setările browserului pentru această adresă." };
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { ok: false, message: "Reîncărcați pagina și încercați din nou." };
      try {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        return await subscribePushAction(sub.toJSON(), navigator.userAgent);
      } catch {
        return { ok: false, message: "Acest browser nu a putut activa notificările." };
      }
    });
  return (
    <div className="card" id="notificari">
      <h3 id="notificari">Notificări</h3>
      <p className="hint">Pentru ce așteaptă după dumneavoastră: documente de semnat, cereri, răspunsuri de verificat. Notificarea conține doar un titlu general, fără nume sau alte date.</p>
      {!env ? null : env.iosBrowser ? (
        <p className="alert">Pe iPhone și iPad, notificările funcționează după ce instalați aplicația pe ecranul principal (Partajează → Adaugă pe ecranul principal) și o deschideți de acolo.</p>
      ) : !env.supported ? (
        <p className="hint">Acest browser nu primește notificări.</p>
      ) : (
        <div className="actions !justify-start flex-wrap">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={enable}>
            Activează notificările pe acest dispozitiv
          </button>
          {devices.length ? (
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => testPushAction())}>
              Trimite o notificare de test
            </button>
          ) : null}
        </div>
      )}
      {msg?.message ? (
        <p className={msg.ok ? "alert alert-ok" : "field-error"} role="status">
          {msg.message}
        </p>
      ) : null}
      <fieldset className="mt-3">
        <legend className="font-medium mb-1">Ce primesc</legend>
        {types.map((t) => (
          <label key={t} className="check-row">
            <input
              type="checkbox"
              checked={!offState.includes(t)}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.checked ? offState.filter((x) => x !== t) : [...offState, t];
                setOff(next);
                run(() => setPushTypesAction(next));
              }}
            />
            {PUSH_TYPE_LABEL[t]}
          </label>
        ))}
      </fieldset>
      {devices.length ? (
        <ul className="list mt-3">
          {devices.map((d) => (
            <li key={d.id} className="item">
              <div className="body">
                <div className="t">{d.label}</div>
                <div className="m">
                  adăugat {d.added}
                  {d.lastOk ? ` · ultima notificare ${d.lastOk}` : ""}
                </div>
              </div>
              <button type="button" className="btn" disabled={pending} onClick={() => run(() => removePushAction(d.id))}>
                Elimină
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint mt-2">Niciun dispozitiv nu primește notificări.</p>
      )}
    </div>
  );
}
