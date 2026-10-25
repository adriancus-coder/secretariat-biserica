import { randomFillSync } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeSignature, SIGNATURE_MAX_BYTES, SignatureImageError } from "./signature-image";

async function pad(width: number, height: number, noise = false) {
  if (!noise) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="M10 ${height / 2} C ${width / 3} 0, ${(2 * width) / 3} ${height}, ${width - 10} ${height / 2}" stroke="black" stroke-width="4" fill="none"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  const pixels = Buffer.alloc(width * height * 4);
  randomFillSync(pixels);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("normalizeSignature", () => {
  it("downscales a large drawing to at most 600×200 and 40 KB", async () => {
    const input = await pad(1170, 390);
    const out = await normalizeSignature(`data:image/png;base64,${input.toString("base64")}`);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeLessThanOrEqual(600);
    expect(meta.height).toBeLessThanOrEqual(200);
    expect(out.length).toBeLessThanOrEqual(SIGNATURE_MAX_BYTES);
  });

  it("keeps a small drawing at its size", async () => {
    const out = await normalizeSignature((await pad(300, 100)).toString("base64"));
    expect((await sharp(out).metadata()).width).toBe(300);
  });

  it("refuses anything that is not a PNG", async () => {
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    await expect(normalizeSignature(jpeg.toString("base64"))).rejects.toBeInstanceOf(SignatureImageError);
    await expect(normalizeSignature("nu e o imagine!")).rejects.toBeInstanceOf(SignatureImageError);
    await expect(normalizeSignature(Buffer.from("abc").toString("base64"))).rejects.toBeInstanceOf(SignatureImageError);
  });

  it("brings a very detailed drawing under 40 KB by trying smaller sizes", async () => {
    const out = await normalizeSignature((await pad(600, 200, true)).toString("base64"));
    expect(out.length).toBeLessThanOrEqual(SIGNATURE_MAX_BYTES);
  });
});
