import "server-only";
import sharp from "sharp";

export const SIGNATURE_MAX_BYTES = 40 * 1024;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
/** A small file can declare a huge image (a decompression bomb): refused before decoding. */
export const SIGNATURE_MAX_PIXELS = 4_000_000;

export class SignatureImageError extends Error {}

/**
 * A signature drawn on the pad ("data:image/png;base64,…" or bare base64), checked to be a PNG and
 * re-encoded server-side at most 600×200 px and 40 KB (smaller sizes are tried before giving up).
 */
export async function normalizeSignature(input: string): Promise<Buffer> {
  const b64 = input.replace(/^data:image\/png;base64,/, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) throw new SignatureImageError("Semnătura nu este o imagine validă.");
  const raw = Buffer.from(b64, "base64");
  if (!raw.length || raw.length > MAX_INPUT_BYTES) throw new SignatureImageError("Semnătura nu este o imagine validă.");
  let meta;
  try {
    meta = await sharp(raw, { limitInputPixels: SIGNATURE_MAX_PIXELS }).metadata();
  } catch {
    throw new SignatureImageError("Semnătura nu este o imagine validă.");
  }
  if (meta.format !== "png") throw new SignatureImageError("Semnătura nu este o imagine validă.");
  if (!meta.width || !meta.height || meta.width * meta.height > SIGNATURE_MAX_PIXELS) throw new SignatureImageError("Semnătura este prea mare.");
  for (const [w, h] of [
    [600, 200],
    [450, 150],
    [300, 100],
  ]) {
    const out = await sharp(raw, { limitInputPixels: SIGNATURE_MAX_PIXELS }).resize(w, h, { fit: "inside", withoutEnlargement: true }).png({ palette: true, compressionLevel: 9 }).toBuffer();
    if (out.length <= SIGNATURE_MAX_BYTES) return out;
  }
  throw new SignatureImageError("Semnătura este prea complexă. Ștergeți și semnați din nou.");
}
