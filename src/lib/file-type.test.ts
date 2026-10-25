import { describe, expect, it } from "vitest";
import { declaredFileType, sniffFileType } from "./file-type";

describe("file type from bytes", () => {
  it("recognises PDF, PNG and JPEG by their signature, whatever the name", () => {
    expect(sniffFileType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))).toBe("image/jpeg");
    expect(sniffFileType(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffFileType(new Uint8Array())).toBeNull();
  });
  it("reads the claim from the browser type, else the extension", () => {
    expect(declaredFileType("scan.pdf", "")).toBe("application/pdf");
    expect(declaredFileType("poza.JPG", "")).toBe("image/jpeg");
    expect(declaredFileType("x", "image/png")).toBe("image/png");
    expect(declaredFileType("poza.heic", "image/heic")).toBe("");
  });
});
