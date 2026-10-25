import "server-only";

/**
 * The total uncompressed size declared by a ZIP's central directory (a .docx is a ZIP), read before
 * anything is decompressed, so a small file that expands to gigabytes is refused up front. Null when
 * the file is not a readable ZIP or uses ZIP64 sizes (never needed for a Word document).
 */
export function zipUncompressedSize(buf: Buffer): number | null {
  // End of central directory record: signature 0x06054b50, within the last 64 KB + 22 bytes.
  const min = Math.max(0, buf.length - 0xffff - 22);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const size = buf.readUInt32LE(p + 24);
    if (size === 0xffffffff) return null;
    total += size;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return total;
}
