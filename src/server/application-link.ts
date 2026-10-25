import "server-only";
import QRCode from "qrcode";
import { requestOrigin } from "./request-origin";
import { appUrl } from "./tokens";

/**
 * The public membership application link (`${APP_URL}/cerere/<slug>`) and its QR code, generated
 * locally by the `qrcode` package (no network). The QR follows the current slug.
 */

const QR_OPTIONS = { errorCorrectionLevel: "M", margin: 2 } as const;

export async function applicationUrl(slug: string): Promise<string> {
  return appUrl(`/cerere/${slug}`, await requestOrigin());
}

/** The text a QR code encodes, read back from its segments (used by the tests). */
export function qrPayload(url: string): string {
  return QRCode.create(url, QR_OPTIONS)
    .segments.map((s) => (typeof s.data === "string" ? s.data : new TextDecoder().decode(s.data as Uint8Array)))
    .join("");
}

export function applicationQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg", width: 220 });
}

/** PNG for "Descarcă PNG" and the poster: large enough to print. */
export function applicationQrPng(url: string, width = 1024): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width });
}
