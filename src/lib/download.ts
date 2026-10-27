/*
 * PWA-DOWNLOADS: every file the app hands out (PDF, Word, Excel, CSV, JSON, PNG) goes through
 * downloadFile(). In the app installed on an iPhone / iPad home screen (display-mode: standalone) a
 * plain download opens the iOS file viewer with no way back, so there the file is fetched and handed to
 * the share sheet („Salvează în Fișiere”, AirDrop …) and the user stays in the app; without file sharing
 * the file opens in a separate window, which iOS shows with „Gata”. Everywhere else: a normal download
 * (a PDF that used to open in a new tab still does). The session cookies go with every request, so the
 * export grant and the step-up work as before. Browser-only; the environment is injectable for tests.
 */

export type DownloadBranch = "share" | "window" | "download";

export type DownloadSource = string | { url: string; init?: RequestInit };

export interface DownloadOptions {
  /** A PDF meant to be read: in a normal browser it opens in a new tab instead of being saved. */
  inline?: boolean;
  /** Personal data (backup, person exports, art. 15 copy, consents): warned once per session before sharing. */
  personal?: boolean;
  /** Asked before a personal file leaves the app (the in-app warning); false = cancelled. */
  confirmPersonal?: () => Promise<boolean>;
}

export type DownloadResult =
  | { kind: "shared" | "cancelled" | "downloaded" | "opened" | "navigated" }
  | { kind: "window"; message: string }
  /** The share sheet refused (the tap's permission expired while the file was prepared): share it with a new tap. */
  | { kind: "ready"; file: File }
  | { kind: "error"; message: string };

export const WINDOW_MESSAGE = "Fișierul s-a deschis într-o fereastră separată; apăsați «Gata» ca să reveniți.";
export const PERSONAL_WARNING = "Fișierul conține date personale. Salvați-l în «Fișiere» într-un loc protejat; nu îl trimiteți pe e-mail sau în chat.";
export const DOWNLOAD_ERROR = "Fișierul nu a putut fi pregătit. Încercați din nou.";
export const DOWNLOAD_FORBIDDEN = "Nu aveți dreptul să descărcați acest fișier.";
/** sessionStorage key: the personal-data warning was accepted in this session. */
export const PERSONAL_WARNING_KEY = "descarcare-date-personale";

/** What the branch choice needs from the browser (a subset of window / navigator). */
export interface DownloadEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** navigator.standalone (iOS) */
  iosStandalone?: boolean;
  /** matchMedia('(display-mode: standalone)').matches */
  displayStandalone: boolean;
  canShare?: (data: { files: File[] }) => boolean;
  hasShare: boolean;
}

/** iPhone / iPod, or an iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(env: Pick<DownloadEnv, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return (env.platform === "MacIntel" || /Macintosh/.test(env.userAgent)) && (env.maxTouchPoints ?? 0) > 1;
}

export function chooseBranch(env: DownloadEnv, probe: File): DownloadBranch {
  if (!isIos(env) || !(env.displayStandalone || env.iosStandalone)) return "download";
  let canShare = false;
  try {
    canShare = env.hasShare && typeof env.canShare === "function" && env.canShare({ files: [probe] });
  } catch {
    canShare = false;
  }
  return canShare ? "share" : "window";
}

export function browserEnv(): DownloadEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    iosStandalone: nav.standalone === true,
    displayStandalone: typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches,
    canShare: typeof nav.canShare === "function" ? (d) => nav.canShare(d) : undefined,
    hasShare: typeof nav.share === "function",
  };
}

/** The file name from Content-Disposition (filename* first), else null. */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

const isAbort = (e: unknown) => typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
const isNotAllowed = (e: unknown) => typeof e === "object" && e !== null && (e as { name?: string }).name === "NotAllowedError";

/** A form POST into a new window (the "window" branch for a POST: an export behind the password). */
function submitInNewWindow(url: string, init: RequestInit) {
  const form = document.createElement("form");
  form.method = (init.method ?? "post").toLowerCase();
  form.action = url;
  form.target = "_blank";
  form.rel = "noopener";
  if (init.body instanceof FormData) {
    for (const [k, v] of init.body.entries()) {
      if (typeof v !== "string") continue;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = v;
      form.append(input);
    }
  }
  document.body.append(form);
  form.submit();
  form.remove();
}

/** A data: URL (the QR codes drawn on the server) as a Blob, without a request. */
export function dataUrlBlob(url: string): Blob {
  const [head, data = ""] = url.split(",", 2);
  const type = head.slice(5).split(";")[0] || "application/octet-stream";
  if (!/;base64$/i.test(head)) return new Blob([decodeURIComponent(data)], { type });
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Saves a Blob with a normal download (the only `a.download` in the app). */
export function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

/** Hands a prepared file to the share sheet; closing the sheet is not an error. */
export async function shareFile(file: File): Promise<DownloadResult> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return { kind: "shared" };
  } catch (e) {
    if (isAbort(e)) return { kind: "cancelled" };
    if (isNotAllowed(e)) return { kind: "ready", file };
    return { kind: "error", message: DOWNLOAD_ERROR };
  }
}

/**
 * Downloads `source` (a URL, or a URL with a POST body) as `filename` / `mime` (the response's own
 * Content-Disposition and Content-Type win), in the branch the device needs.
 */
export async function downloadFile(source: DownloadSource, filename: string, mime: string, opts: DownloadOptions = {}, env: DownloadEnv = browserEnv()): Promise<DownloadResult> {
  const { url, init = {} } = typeof source === "string" ? { url: source } : source;
  const isGet = !init.method || init.method.toUpperCase() === "GET";
  const branch = chooseBranch(env, new File([], filename, { type: mime }));
  if (opts.personal && branch !== "download" && opts.confirmPersonal && !(await opts.confirmPersonal())) return { kind: "cancelled" };
  if (url.startsWith("data:")) {
    const blob = dataUrlBlob(url);
    if (branch === "share") return shareFile(new File([blob], filename, { type: blob.type || mime }));
    if (branch === "window") {
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
      return { kind: "window", message: WINDOW_MESSAGE };
    }
    saveBlob(blob, filename);
    return { kind: "downloaded" };
  }
  if (branch === "window") {
    if (isGet) window.open(url, "_blank", "noopener");
    else submitInNewWindow(url, init);
    return { kind: "window", message: WINDOW_MESSAGE };
  }
  // A PDF to read in a normal browser: a new tab, as the links did.
  if (branch === "download" && opts.inline && isGet) {
    window.open(url, "_blank", "noopener");
    return { kind: "opened" };
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "same-origin" });
  } catch {
    return { kind: "error", message: DOWNLOAD_ERROR };
  }
  const type = res.headers.get("content-type") ?? "";
  if (res.ok && type.startsWith("text/html")) {
    // An export refused with a message (wrong password, confirmation needed): the page that says so.
    if (res.redirected) {
      window.location.assign(res.url);
      return { kind: "navigated" };
    }
    return { kind: "error", message: DOWNLOAD_ERROR };
  }
  if (!res.ok) return { kind: "error", message: res.status === 401 || res.status === 403 ? DOWNLOAD_FORBIDDEN : DOWNLOAD_ERROR };
  const blob = await res.blob();
  const name = fileNameFromDisposition(res.headers.get("content-disposition")) ?? filename;
  const fileType = type.split(";")[0] || mime;
  if (branch === "share") return shareFile(new File([blob], name, { type: fileType }));
  saveBlob(blob, name);
  return { kind: "downloaded" };
}

export const MIME = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
} as const;
