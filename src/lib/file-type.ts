/** The real type of an uploaded file, from its first bytes (the browser's `type` can say anything). Pure. */
export type SniffedType = "application/pdf" | "image/png" | "image/jpeg";

export function sniffFileType(data: Uint8Array): SniffedType | null {
  const b = (i: number) => data[i];
  if (data.length >= 5 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d) return "application/pdf"; // %PDF-
  if (data.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return "image/png";
  if (data.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  return null;
}

/** What the name or the browser says the file is, among the three types ("" = no claim). */
export function declaredFileType(name: string, browserType: string): SniffedType | "" {
  const byType: Record<string, SniffedType> = { "application/pdf": "application/pdf", "image/png": "image/png", "image/jpeg": "image/jpeg", "image/jpg": "image/jpeg" };
  if (byType[browserType]) return byType[browserType];
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "";
}
