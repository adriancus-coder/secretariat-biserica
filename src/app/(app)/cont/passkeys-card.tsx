"use client";

import { startRegistration, type RegistrationResponseJSON } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { webAuthnMessage } from "@/components/passkey/passkey-button";
import { FormMessage } from "@/components/ui/form-bits";
import { initialFormState } from "@/lib/form-state";
import { passkeyRegisterAction, passkeyRegistrationOptionsAction, removePasskeyAction } from "@/server/actions/passkeys";

export interface PasskeyRow {
  id: string;
  deviceName: string;
  /** "25.10.2026 14:03" or null. */
  lastUsed: string | null;
  created: string;
}

/** A default device name from the browser ("iPhone", "Android", "Windows", "Mac"). */
function guessDevice(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Telefon Android";
  if (/Windows/.test(ua)) return "Calculator Windows";
  if (/Mac/.test(ua)) return "Mac";
  return "Dispozitiv";
}

/**
 * Cont → Securitate → "Face ID / amprentă / PIN-ul telefonului": add this device (password first),
 * the list with name and last use, and "Elimină" (password again).
 */
export function PasskeysCard({ rows, configured, required }: { rows: PasskeyRow[]; configured: boolean; required: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      setMsg(null);
      const opts = await passkeyRegistrationOptionsAction(password);
      if ("error" in opts) return setMsg({ ok: false, text: opts.error });
      let response: RegistrationResponseJSON;
      try {
        response = await startRegistration({ optionsJSON: opts.options });
      } catch (e) {
        return setMsg({ ok: false, text: webAuthnMessage(e) });
      }
      const r = await passkeyRegisterAction(response, name || guessDevice());
      setMsg({ ok: Boolean(r.ok), text: r.message ?? "" });
      if (r.ok) {
        setPassword("");
        setName("");
        router.refresh();
      }
    });
  }

  return (
    <div className="card" id="dispozitive">
      <h3>Face ID / amprentă / PIN-ul telefonului</h3>
      <p className="hint mb-3">
        Intrați în cont și confirmați operațiile importante cu deblocarea dispozitivului. Amprenta sau fața nu părăsesc niciodată telefonul:
        aplicația primește doar o confirmare semnată de dispozitiv.
        {required ? " Biserica cere pastorilor și administratorilor intrarea cu parolă + Face ID / amprentă." : ""}
      </p>
      {rows.length ? (
        <ul className="list mb-3">
          {rows.map((r) => (
            <RemoveRow key={r.id} row={r} onRemoved={() => router.refresh()} />
          ))}
        </ul>
      ) : (
        <p className="hint mb-3">Niciun dispozitiv înregistrat.</p>
      )}
      {configured ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="row2">
            <div className="field">
              <label htmlFor="pk-name">Numele dispozitivului</label>
              <input id="pk-name" value={name} maxLength={60} placeholder="ex. iPhone-ul meu" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pk-password">Parola contului</label>
              <input id="pk-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          {msg ? (
            <div className={`alert ${msg.ok ? "alert-ok" : ""}`} role={msg.ok ? "status" : "alert"}>
              {msg.text}
            </div>
          ) : null}
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={pending || !password}>
              {pending ? "Se așteaptă dispozitivul…" : "Adaugă acest dispozitiv"}
            </button>
          </div>
        </form>
      ) : (
        <p className="hint">Confirmarea pe dispozitiv nu este configurată pentru această aplicație (adresa publică lipsește).</p>
      )}
    </div>
  );
}

function RemoveRow({ row, onRemoved }: { row: PasskeyRow; onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: typeof initialFormState, fd: FormData) => {
    const r = await removePasskeyAction(row.id, prev, fd);
    if (r.ok) onRemoved();
    return r;
  }, initialFormState);
  return (
    <li className="item !cursor-default flex-wrap">
      <div className="body">
        <div className="t">{row.deviceName}</div>
        <div className="m">
          adăugat {row.created} · {row.lastUsed ? `folosit ultima dată ${row.lastUsed}` : "nefolosit încă"}
        </div>
      </div>
      {open ? (
        <form action={action} className="flex flex-wrap gap-2 items-end w-full">
          <div className="field !mb-0 grow">
            <label htmlFor={`rm-${row.id}`}>Parola</label>
            <input id={`rm-${row.id}`} name="parola" type="password" autoComplete="current-password" required />
          </div>
          <button type="submit" className="btn btn-danger" disabled={pending}>
            Elimină
          </button>
          <FormMessage state={state} />
        </form>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          Elimină
        </button>
      )}
    </li>
  );
}
