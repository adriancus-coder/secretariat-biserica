import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PhotoError, processAssetPhoto, sniffImageType } from "./asset-photo";

/** A PNG whose header declares w×h, with no real pixel data (a "decompression bomb" header). */
function pngHeaderOnly(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IEND", Buffer.alloc(0))]);
}

describe("photos of the goods (PATRIMONY-PHOTOS)", () => {
  it("a JPEG with GPS in its EXIF: the saved photo has no EXIF / GPS any more", async () => {
    const withGps = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#3a6" } })
      .jpeg()
      .withExif({ IFD0: { Make: "TestPhone", DateTime: "2026:10:01 10:00:00" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "58/1 58/1 0/1" } })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const p = await processAssetPhoto(withGps);
    const meta = await sharp(p.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect((await sharp(p.thumb).metadata()).exif).toBeUndefined();
    expect(p.data.includes(Buffer.from("TestPhone"))).toBe(false);
  });

  it("a PNG of 6000×4000 → 1600 px on the long side, JPEG; a 400 px thumbnail", async () => {
    const png = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: "#ccc" } }).png({ compressionLevel: 1 }).toBuffer();
    const p = await processAssetPhoto(png);
    expect([p.width, p.height]).toEqual([1600, 1067]);
    expect((await sharp(p.data).metadata()).format).toBe("jpeg");
    expect((await sharp(p.thumb).metadata()).width).toBe(400);
  });

  it("the EXIF orientation is applied before the metadata goes", async () => {
    const rotated = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#fff" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const p = await processAssetPhoto(rotated);
    expect([p.width, p.height]).toEqual([200, 400]);
  });

  it("a .jpg that is really a PDF is refused (the content decides, not the name)", async () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
    expect(sniffImageType(pdf)).toBeNull();
    await expect(processAssetPhoto(pdf)).rejects.toThrow("Fișierul nu este o poză JPEG, PNG sau WebP.");
  });

  it("an image declaring 20000×20000 is refused in under a second, before decoding", async () => {
    const bomb = pngHeaderOnly(20000, 20000);
    expect(bomb.length).toBeLessThan(100);
    const t0 = Date.now();
    await expect(processAssetPhoto(bomb)).rejects.toBeInstanceOf(PhotoError);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("a file over 15 MB is refused", async () => {
    const big = Buffer.alloc(15 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    await expect(processAssetPhoto(big)).rejects.toThrow("Poza este mai mare de 15 MB.");
  });
});
