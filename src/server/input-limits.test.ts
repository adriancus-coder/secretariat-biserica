import JSZip from "jszip";
import sharp from "sharp";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { docxText, DOCX_MAX_UNCOMPRESSED } from "./minutes-import";
import { normalizeSignature } from "./signature-image";
import { zipUncompressedSize } from "./zip-size";

/** A real PNG whose header is rewritten to declare `w`×`h` pixels (valid CRC): a decompression bomb. */
async function pngDeclaring(w: number, h: number): Promise<Buffer> {
  const png = Buffer.from(await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer());
  png.writeUInt32BE(w, 16);
  png.writeUInt32BE(h, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)) >>> 0, 29);
  return png;
}

describe("input limits", () => {
  it("refuses a signature declaring 20000×20000 pixels, quickly", async () => {
    const bomb = (await pngDeclaring(20000, 20000)).toString("base64");
    const t = performance.now();
    await expect(normalizeSignature(bomb)).rejects.toThrow();
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it("still accepts a normal signature", async () => {
    const ok = (await sharp({ create: { width: 600, height: 200, channels: 4, background: "#ffffff00" } }).png().toBuffer()).toString("base64");
    expect((await normalizeSignature(ok)).length).toBeGreaterThan(0);
  });

  it("reads the declared uncompressed size of a ZIP and refuses a Word bomb before unpacking", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", Buffer.alloc(60 * 1024 * 1024));
    const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(zipUncompressedSize(bomb)).toBe(60 * 1024 * 1024);
    expect(zipUncompressedSize(bomb)!).toBeGreaterThan(DOCX_MAX_UNCOMPRESSED);
    const file = new File([new Uint8Array(bomb)], "pv.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    await expect(docxText(file)).rejects.toThrow("peste 50 MB");
    expect(zipUncompressedSize(Buffer.from("not a zip at all, just text"))).toBeNull();
  });
});
