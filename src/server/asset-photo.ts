import "server-only";
import sharp from "sharp";
import { PHOTO_FULL_EDGE, PHOTO_JPEG_QUALITY, PHOTO_MAX_FILE_BYTES, PHOTO_MAX_PIXELS, PHOTO_THUMB_EDGE } from "@/lib/asset-photos";

export class PhotoError extends Error {}

/** The real type from the first bytes, never from the file's name or the browser's word. */
export function sniffImageType(b: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "webp";
  return null;
}

export interface ProcessedPhoto {
  data: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/**
 * A photo of a good, re-encoded on the server (PATRIMONY-PHOTOS): JPEG, PNG or WebP by content, at most
 * 15 MB and 120 megapixels (read from the header, before any decoding), rotated by its EXIF orientation,
 * then every metadata dropped (EXIF, GPS, date, device: sharp writes none unless asked), at most 1600 px on
 * the long side as JPEG quality 78, and a 400 px thumbnail.
 */
export async function processAssetPhoto(raw: Uint8Array): Promise<ProcessedPhoto> {
  if (!raw.length) throw new PhotoError("Alegeți o poză.");
  if (raw.length > PHOTO_MAX_FILE_BYTES) throw new PhotoError("Poza este mai mare de 15 MB.");
  const kind = sniffImageType(raw);
  if (!kind) throw new PhotoError("Fișierul nu este o poză JPEG, PNG sau WebP.");
  let meta;
  try {
    meta = await sharp(raw, { limitInputPixels: PHOTO_MAX_PIXELS, failOn: "error" }).metadata();
  } catch {
    throw new PhotoError("Poza nu poate fi citită.");
  }
  if (meta.format !== kind) throw new PhotoError("Fișierul nu este o poză JPEG, PNG sau WebP.");
  if (!meta.width || !meta.height) throw new PhotoError("Poza nu poate fi citită.");
  if (meta.width * meta.height > PHOTO_MAX_PIXELS) throw new PhotoError("Poza are prea mulți pixeli (peste 120 de megapixeli).");
  try {
    const base = () => sharp(raw, { limitInputPixels: PHOTO_MAX_PIXELS, failOn: "error" }).rotate();
    const full = await base()
      .resize(PHOTO_FULL_EDGE, PHOTO_FULL_EDGE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base()
      .resize(PHOTO_THUMB_EDGE, PHOTO_THUMB_EDGE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    return { data: full.data, thumb, width: full.info.width, height: full.info.height };
  } catch {
    throw new PhotoError("Poza nu poate fi citită.");
  }
}
