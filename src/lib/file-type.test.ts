import { describe, expect, it } from "vitest";
import { declaredKind, sniffFileType } from "./file-type";

describe("file type from bytes", () => {
  it("recognises PDF, PNG, JPEG, HEIC, WebP, GIF and TIFF by their signature, whatever the name", () => {
    expect(sniffFileType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))).toBe("image/jpeg");
    expect(sniffFileType(Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from("ftypheic")]))).toBe("image/heic");
    expect(sniffFileType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmif1")]))).toBe("image/heic");
    expect(sniffFileType(Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ", "latin1"))).toBe("image/webp");
    expect(sniffFileType(Buffer.from("GIF89a"))).toBe("image/gif");
    expect(sniffFileType(Buffer.from([0x49, 0x49, 0x2a, 0]))).toBe("image/tiff");
    expect(sniffFileType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom")]))).toBeNull(); // an MP4
    expect(sniffFileType(new Uint8Array())).toBeNull();
  });
  it("reads the claim (document or image) from the browser type, else the extension", () => {
    expect(declaredKind("scan.pdf", "")).toBe("document");
    expect(declaredKind("poza.HEIC", "")).toBe("image");
    expect(declaredKind("x", "image/png")).toBe("image");
    expect(declaredKind("fisier", "")).toBe("");
  });
});
