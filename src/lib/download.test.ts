import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseBranch, DOWNLOAD_FORBIDDEN, downloadFile, fileNameFromDisposition, isIos, WINDOW_MESSAGE, type DownloadEnv } from "./download";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

const env = (over: Partial<DownloadEnv> = {}): DownloadEnv => ({ userAgent: IPHONE, displayStandalone: true, hasShare: true, canShare: () => true, ...over });
const probe = new File([], "copie.json", { type: "application/json" });

describe("PWA-DOWNLOADS: the branch", () => {
  it("iPhone / iPad installed on the home screen with file sharing → share", () => {
    expect(chooseBranch(env(), probe)).toBe("share");
    expect(chooseBranch(env({ displayStandalone: false, iosStandalone: true }), probe)).toBe("share");
    expect(chooseBranch(env({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 5 }), probe)).toBe("share");
  });
  it("installed without file sharing → a separate window", () => {
    expect(chooseBranch(env({ canShare: () => false }), probe)).toBe("window");
    expect(chooseBranch(env({ hasShare: false, canShare: undefined }), probe)).toBe("window");
    expect(chooseBranch(env({ canShare: () => { throw new TypeError("x"); } }), probe)).toBe("window");
  });
  it("a normal browser (Safari not installed, a Mac, Android, Android installed) → a normal download", () => {
    expect(chooseBranch(env({ displayStandalone: false }), probe)).toBe("download");
    expect(chooseBranch(env({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 0 }), probe)).toBe("download");
    expect(chooseBranch(env({ userAgent: ANDROID }), probe)).toBe("download");
    expect(isIos({ userAgent: ANDROID })).toBe(false);
  });
  it("the file name from Content-Disposition", () => {
    expect(fileNameFromDisposition(`attachment; filename="a.pdf"; filename*=UTF-8''dare-de-seam%C4%83.pdf`)).toBe("dare-de-seamă.pdf");
    expect(fileNameFromDisposition(`inline; filename="inventar.pdf"`)).toBe("inventar.pdf");
    expect(fileNameFromDisposition(null)).toBeNull();
  });
});

describe("PWA-DOWNLOADS: downloadFile with a simulated iPhone", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: string, type: string, init: ResponseInit = {}) =>
    vi.fn(async () => new Response(body, { status: 200, ...init, headers: { "content-type": type, "content-disposition": 'attachment; filename="copie.json"', ...(init.headers ?? {}) } }));

  it("share: the File with the response's name, type and size; AbortError is not an error", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("fetch", respond('{"a":1}', "application/json"));
    vi.stubGlobal("navigator", { share });
    const r = await downloadFile({ url: "/api/export", init: { method: "POST", body: new FormData() } }, "x.json", "application/json", {}, env());
    expect(r).toEqual({ kind: "shared" });
    const file = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0];
    expect([file.name, file.type, file.size]).toEqual(["copie.json", "application/json", 7]);
    vi.stubGlobal("navigator", { share: vi.fn(async () => { throw new DOMException("x", "AbortError"); }) });
    expect(await downloadFile("/a", "x.json", "application/json", {}, env())).toEqual({ kind: "cancelled" });
  });

  it("the personal-data warning only where the file leaves the app; declining cancels without a request", async () => {
    const fetch = respond("{}", "application/json");
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("navigator", { share: vi.fn(async () => undefined) });
    const confirmPersonal = vi.fn(async () => false);
    expect(await downloadFile("/a", "x.json", "application/json", { personal: true, confirmPersonal }, env())).toEqual({ kind: "cancelled" });
    expect(fetch).not.toHaveBeenCalled();
    // A file without personal data: never asked.
    await downloadFile("/a", "x.json", "application/json", { confirmPersonal }, env());
    expect(confirmPersonal).toHaveBeenCalledTimes(1);
  });

  it("window: opened with noopener, no request, the message for «Gata»", async () => {
    const open = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("window", { open });
    vi.stubGlobal("fetch", fetch);
    expect(await downloadFile("/pdf/dare-de-seama?an=2026", "d.pdf", "application/pdf", {}, env({ canShare: () => false }))).toEqual({ kind: "window", message: WINDOW_MESSAGE });
    expect(open).toHaveBeenCalledWith("/pdf/dare-de-seama?an=2026", "_blank", "noopener");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a refused request shows the message; a password page is followed", async () => {
    vi.stubGlobal("fetch", respond("nu", "text/html", { status: 403 }));
    expect(await downloadFile("/a", "x", "application/pdf", {}, env())).toEqual({ kind: "error", message: DOWNLOAD_FORBIDDEN });
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, redirected: true, url: "http://x/setari/date?export=parola", headers: new Headers({ "content-type": "text/html" }) })));
    expect(await downloadFile("/api/export", "x", "application/json", {}, env())).toEqual({ kind: "navigated" });
    expect(assign).toHaveBeenCalledWith("http://x/setari/date?export=parola");
  });
});
