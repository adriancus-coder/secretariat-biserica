"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type FormEvent, type FormHTMLAttributes, type ReactNode, type Ref } from "react";
import { downloadFile, PERSONAL_WARNING, PERSONAL_WARNING_KEY, shareFile, type DownloadOptions, type DownloadSource } from "@/lib/download";

/*
 * PWA-DOWNLOADS: the controls that hand out files. DownloadLink / SortAwareDownload (a link-looking
 * button), DownloadForm + DownloadSubmit (exports behind a form: backup, persons, art. 15 copy). All go
 * through downloadFile(); while the file is prepared the control reads „Se pregătește…” and is disabled.
 */

type Opts = Pick<DownloadOptions, "inline" | "personal">;

function warned(): boolean {
  try {
    return sessionStorage.getItem(PERSONAL_WARNING_KEY) === "1";
  } catch {
    return false;
  }
}
function markWarned() {
  try {
    sessionStorage.setItem(PERSONAL_WARNING_KEY, "1");
  } catch {
    /* private mode: asked again next time */
  }
}

/** The state of one download control: pending, the message, the personal-data warning, the „share” retry. */
export function useDownload() {
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [ask, setAsk] = useState<((ok: boolean) => void) | null>(null);
  const [ready, setReady] = useState<File | null>(null);

  const confirmPersonal = useCallback(
    () =>
      warned()
        ? Promise.resolve(true)
        : new Promise<boolean>((resolve) =>
            setAsk(() => (ok: boolean) => {
              setAsk(null);
              if (ok) markWarned();
              resolve(ok);
            }),
          ),
    [],
  );

  const start = useCallback(
    async (source: DownloadSource, filename: string, mime: string, opts: Opts = {}, key = "1") => {
      setMessage(null);
      setReady(null);
      setPending(key);
      try {
        const r = await downloadFile(source, filename, mime, { ...opts, confirmPersonal });
        if (r.kind === "window") setMessage({ text: r.message, error: false });
        else if (r.kind === "error") setMessage({ text: r.message, error: true });
        else if (r.kind === "ready") setReady(r.file);
      } finally {
        setPending(null);
      }
    },
    [confirmPersonal],
  );

  const ui = (
    <>
      {ready ? (
        <span className="download-ready">
          Fișierul este gata.{" "}
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              const r = await shareFile(ready);
              if (r.kind !== "ready") setReady(null);
              if (r.kind === "error") setMessage({ text: r.message, error: true });
            }}
          >
            Partajează fișierul
          </button>
        </span>
      ) : null}
      {message ? (
        <span className={message.error ? "field-error download-msg" : "hint download-msg"} role={message.error ? "alert" : "status"}>
          {message.text}
        </span>
      ) : null}
      {ask ? (
        <div className="photo-overlay" role="alertdialog" aria-modal="true" aria-labelledby="download-warning" onClick={(e) => e.target === e.currentTarget && ask(false)}>
          <div className="photo-panel download-warning">
            <p id="download-warning">{PERSONAL_WARNING}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className="btn btn-primary" autoFocus onClick={() => ask(true)}>
                Am înțeles, continuă
              </button>
              <button type="button" className="btn" onClick={() => ask(false)}>
                Renunță
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
  return { pending, start, ui };
}

type LinkProps = { file: string; filename: string; mime: string; children: ReactNode; className?: string; title?: string } & Opts;

/** A file to download, shown like the app's buttons (`className`), e.g. „Descarcă PDF”. */
export function DownloadLink({ file, filename, mime, inline, personal, children, className = "btn", title }: LinkProps) {
  const d = useDownload();
  return (
    <>
      <button type="button" className={className} title={title} disabled={d.pending !== null} aria-busy={d.pending !== null} onClick={() => void d.start(file, filename, mime, { inline, personal })}>
        {d.pending ? "Se pregătește…" : children}
      </button>
      {d.ui}
    </>
  );
}

/** DownloadLink with the page's table sort (`sort`, `dir`) added, like the old SortAwareLink. */
export function SortAwareDownload({ params: fixed = {}, file, ...rest }: LinkProps & { params?: Record<string, string | undefined> }) {
  const params = useSearchParams();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(fixed)) if (v) q.set(k, v);
  for (const k of ["sort", "dir"]) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  const qs = q.toString();
  return <DownloadLink file={`${file}${qs ? `?${qs}` : ""}`} {...rest} />;
}

const FormCtx = createContext<{ pending: string | null }>({ pending: null });

/**
 * A form whose submit hands out a file (GET → the query, POST → the body); the clicked DownloadSubmit's
 * name / value travel with it, like a native submit.
 */
export function DownloadForm({
  action,
  method = "get",
  filename,
  mime,
  personal,
  inline,
  formRef,
  children,
  ...rest
}: { action: string; method?: "get" | "post"; filename: string; mime: string; formRef?: Ref<HTMLFormElement>; children: ReactNode } & Opts & Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method" | "onSubmit">) {
  const d = useDownload();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const body = new FormData(e.currentTarget, submitter);
    const key = submitter?.value || "1";
    const fmt = submitter?.dataset.mime;
    const name = submitter?.dataset.filename ?? filename;
    if (method === "get") {
      const q = new URLSearchParams();
      for (const [k, v] of body.entries()) if (typeof v === "string") q.append(k, v);
      void d.start(`${action}${action.includes("?") ? "&" : "?"}${q}`, name, fmt ?? mime, { personal, inline }, key);
    } else void d.start({ url: action, init: { method: "POST", body } }, name, fmt ?? mime, { personal, inline }, key);
  }
  return (
    <FormCtx.Provider value={{ pending: d.pending }}>
      <form
        ref={formRef}
        method={method}
        action={action}
        onSubmit={onSubmit}
        {...rest}
      >
        {children}
        {d.ui}
      </form>
    </FormCtx.Provider>
  );
}

/** A DownloadForm's submit button: „Se pregătește…” while its file is prepared; `mime` / `filename` per format. */
export function DownloadSubmit({ children, value, disabled, mime, filename, ...rest }: { children: ReactNode; mime?: string; filename?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useContext(FormCtx);
  const mine = pending !== null && pending === (value ? String(value) : "1");
  return (
    <button type="submit" value={value} disabled={disabled || pending !== null} aria-busy={mine} data-mime={mime} data-filename={filename} {...rest}>
      {mine ? "Se pregătește…" : children}
    </button>
  );
}
