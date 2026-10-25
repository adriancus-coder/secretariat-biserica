/** The real type of an uploaded file, from its first bytes (the browser's `type` can say anything). Pure. */
export type SniffedType = "application/pdf" | "image/png" | "image/jpeg" | "image/heic" | "image/webp" | "image/gif" | "image/tiff";

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"]);

const ascii = (data: Uint8Array, start: number, end: number) => String.fromCharCode(...data.subarray(start, end));

export function sniffFileType(data: Uint8Array): SniffedType | null {
  const b = (i: number) => data[i];
  if (data.length >= 5 && ascii(data, 0, 5) === "%PDF-") return "application/pdf";
  if (data.length >= 8 && b(0) === 0x89 && ascii(data, 1, 4) === "PNG" && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return "image/png";
  if (data.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  // ISO-BMFF: "ftyp" box with a HEIF brand (iPhone photos are "heic").
  if (data.length >= 12 && ascii(data, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(data, 8, 12))) return "image/heic";
  if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP") return "image/webp";
  if (data.length >= 6 && (ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a")) return "image/gif";
  if (data.length >= 4 && ((b(0) === 0x49 && b(1) === 0x49 && b(2) === 0x2a && b(3) === 0) || (b(0) === 0x4d && b(1) === 0x4d && b(2) === 0 && b(3) === 0x2a))) return "image/tiff";
  return null;
}

/** What the name or the browser says the file is: a document (PDF), an image, or nothing specific. */
export function declaredKind(name: string, browserType: string): "document" | "image" | "" {
  if (browserType === "application/pdf" || /\.pdf$/i.test(name)) return "document";
  if (browserType.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/i.test(name)) return "image";
  return "";
}
