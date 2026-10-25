"use client";

import { startAuthentication, type AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { webAuthnMessage } from "@/components/passkey/passkey-button";
import { SignaturePad } from "@/components/signature-pad";
import { presenceOptionsAction } from "@/server/actions/passkeys";
import { deleteMySignatureAction, saveMySignatureAction } from "@/server/actions/document-signatures";

/**
 * Cont → "Semnătura mea": draw it (or upload a PNG); saving or replacing it needs the device unlock
 * (or the password without a passkey). It is used on a document only after a fresh device unlock.
 */
export function MySignatureCard({ name, current, savedAt, hasPasskey }: { name: string; current: string | null; savedAt: string | null; hasPasskey: boolean }) {
  const router = useRouter();
  const [drawing, setDrawing] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!png) return;
    start(async () => {
      setMsg(null);
      let response: AuthenticationResponseJSON | undefined;
      if (hasPasskey) {
        const opts = await presenceOptionsAction("semnatura-salvata");
        if ("error" in opts) return setMsg({ ok: false, text: opts.error });
        try {
          response = await startAuthentication({ optionsJSON: opts.options });
        } catch (e) {
          return setMsg({ ok: false, text: webAuthnMessage(e) });
        }
      }
      const r = await saveMySignatureAction({ png, response, password: hasPasskey ? undefined : password });
      setMsg({ ok: Boolean(r.ok), text: r.message ?? "" });
      if (r.ok) {
        setPng(null);
        setPassword("");
        router.refresh();
      }
    });
  }

  function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== "image/png" || file.size > 2_000_000) return setMsg({ ok: false, text: "Alegeți o imagine PNG de cel mult 2 MB." });
    const reader = new FileReader();
    reader.onload = () => setPng(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="card" id="semnatura">
      <h3>Semnătura mea</h3>
      <p className="hint mb-3">
        O semnătură salvată se pune pe un document doar după deblocarea dispozitivului dumneavoastră (Face ID, amprentă sau PIN), de fiecare dată.
        {hasPasskey ? "" : " Adăugați întâi acest dispozitiv mai sus pentru a o putea folosi."}
      </p>
      {current ? (
        <div className="signature-preview mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt="Semnătura salvată" />
          <span className="hint block">salvată la {savedAt}</span>
        </div>
      ) : (
        <p className="hint">Nicio semnătură salvată.</p>
      )}
      {png ? (
        <div className="signature-preview mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={png} alt="Semnătura nouă" />
          <span className="hint block">semnătura nouă — nesalvată</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 mb-2">
        <button type="button" className="btn" onClick={() => setDrawing(true)}>
          {current ? "Desenează din nou" : "Desenează semnătura"}
        </button>
        <label className="btn">
          Încarcă PNG
          <input type="file" accept="image/png" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {current ? (
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() => start(async () => {
              const r = await deleteMySignatureAction();
              setMsg({ ok: Boolean(r.ok), text: r.message ?? "" });
              router.refresh();
            })}
          >
            Șterge
          </button>
        ) : null}
      </div>
      {png ? (
        <div className="flex flex-wrap gap-2 items-end">
          {hasPasskey ? null : (
            <div className="field !mb-0 grow">
              <label htmlFor="sig-password">Parola contului</label>
              <input id="sig-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <button type="button" className="btn btn-primary" disabled={pending || (!hasPasskey && !password)} onClick={save}>
            {pending ? "Se salvează…" : hasPasskey ? "Salvează (confirmare pe dispozitiv)" : "Salvează"}
          </button>
        </div>
      ) : null}
      {msg ? (
        <div className={`alert mt-2 ${msg.ok ? "alert-ok" : ""}`} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </div>
      ) : null}
      {drawing ? (
        <SignaturePad
          name={name}
          busy={false}
          onCancel={() => setDrawing(false)}
          onConfirm={(data) => {
            setPng(data);
            setDrawing(false);
          }}
        />
      ) : null}
    </div>
  );
}
