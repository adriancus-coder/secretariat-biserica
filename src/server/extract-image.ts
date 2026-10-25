import "server-only";
import sharp, { type Sharp } from "sharp";
import type { ExtractMediaType } from "@/lib/schemas/extract";
import type { SniffedType } from "@/lib/file-type";

/**
 * Turns an upload into something the Claude API accepts (PDF, JPEG, PNG): phone formats (HEIC/HEIF,
 * WebP, TIFF, GIF) become JPEG, very large photos are scaled down, PDFs over 20 pages are refused.
 * Everything happens in memory.
 */

export const EXTRACT_MAX_PAGES = 20;
/** Photos above this long side are scaled down to about EXTRACT_TARGET_SIDE (plenty for reading text). */
export const EXTRACT_MAX_SIDE = 4000;
export const EXTRACT_TARGET_SIDE = 2500;
const JPEG_QUALITY = 85;
/** A 20 MB file cannot honestly hold more; larger declared sizes are decompression bombs. */
const MAX_INPUT_PIXELS = 120_000_000;

export class ExtractInputError extends Error {}

/** HEIC decoder (WebAssembly libheif): RGBA pixels. Injected in tests. */
export type HeicDecoder = (buffer: Buffer) => Promise<{ width: number; height: number; data: Uint8ClampedArray | Uint8Array }>;

const defaultHeicDecoder: HeicDecoder = async (buffer) => {
  const { default: decode } = await import("heic-decode");
  return decode({ buffer });
};

/**
 * Pages of a PDF: the largest "/Count" of a page tree, else the number of "/Type /Page" objects.
 * Read from the raw bytes without parsing streams; good enough to refuse a 25-page scan.
 */
export function pdfPageCount(pdf: Buffer): number {
  const text = pdf.toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((m) => Number(m[1] ?? m[2]));
  const pages = (text.match(/\/Type\s*\/Page(?!s)\b/g) ?? []).length;
  return Math.max(pages, ...counts, 0);
}

export interface PreparedUpload {
  mediaType: ExtractMediaType;
  data: Buffer;
  /** What was done, for the log ("heic→jpeg", "downscaled 5000→2500"); never the content. */
  steps: string[];
}

export async function prepareUpload(data: Buffer, type: SniffedType, decodeHeic: HeicDecoder = defaultHeicDecoder): Promise<PreparedUpload> {
  if (type === "application/pdf") {
    const pages = pdfPageCount(data);
    if (pages > EXTRACT_MAX_PAGES) {
      throw new ExtractInputError(`PDF-ul are ${pages} de pagini; se pot citi cel mult ${EXTRACT_MAX_PAGES}. Împărțiți documentul în părți mai mici.`);
    }
    return { mediaType: "application/pdf", data, steps: [] };
  }

  const steps: string[] = [];
  let image: Sharp;
  try {
    if (type === "image/heic") {
      const decoded = await decodeHeic(data);
      if (decoded.width * decoded.height > MAX_INPUT_PIXELS) throw new ExtractInputError("Poza este prea mare.");
      image = sharp(Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength), {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
      });
      steps.push("heic→jpeg");
    } else {
      // The EXIF orientation is applied (rotate()), so a photo taken sideways is read upright.
      image = sharp(data, { limitInputPixels: MAX_INPUT_PIXELS, animated: false }).rotate();
    }
    const meta = await image.metadata();
    const width = meta.autoOrient?.width ?? meta.width ?? 0;
    const height = meta.autoOrient?.height ?? meta.height ?? 0;
    const longSide = Math.max(width, height);
    const keepAsIs = (type === "image/jpeg" || type === "image/png") && longSide <= EXTRACT_MAX_SIDE;
    if (keepAsIs) return { mediaType: type, data, steps };
    if (type !== "image/heic" && type !== "image/jpeg" && type !== "image/png") steps.push(`${type.slice(6)}→jpeg`);
    if (longSide > EXTRACT_MAX_SIDE) {
      image = image.resize(EXTRACT_TARGET_SIDE, EXTRACT_TARGET_SIDE, { fit: "inside", withoutEnlargement: true });
      steps.push(`downscaled ${longSide}→${EXTRACT_TARGET_SIDE}`);
    }
    const out = await image.flatten({ background: "#ffffff" }).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    return { mediaType: "image/jpeg", data: out, steps };
  } catch (error) {
    if (error instanceof ExtractInputError) throw error;
    throw new ExtractInputError("Poza nu a putut fi deschisă. Încărcați un PDF sau o poză JPG/PNG.");
  }
}
