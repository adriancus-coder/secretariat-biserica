import { describe, expect, it } from "vitest";
import { internationalPhone, whatsappDirectUrl } from "./phone";

describe("internationalPhone", () => {
  it("adds 47 to an 8-digit Norwegian number written locally", () => {
    expect(internationalPhone("41234567")).toBe("4741234567");
    expect(internationalPhone("412 34 567")).toBe("4741234567");
    expect(internationalPhone("41 23 45 67")).toBe("4741234567");
  });

  it("reads +47 and 0047", () => {
    expect(internationalPhone("+47 412 34 567")).toBe("4741234567");
    expect(internationalPhone("0047 41234567")).toBe("4741234567");
  });

  it("reads +40, 0040 and a Romanian mobile written locally", () => {
    expect(internationalPhone("+40 722 123 456")).toBe("40722123456");
    expect(internationalPhone("0040722123456")).toBe("40722123456");
    expect(internationalPhone("0722 123 456")).toBe("40722123456");
    expect(internationalPhone("0722-123-456")).toBe("40722123456");
  });

  it("keeps any other country code written with + or 00", () => {
    expect(internationalPhone("+46 70 123 45 67")).toBe("46701234567");
    expect(internationalPhone("0049 151 23456789")).toBe("4915123456789");
    expect(internationalPhone("+44 (0)7700 900123")).toBe("4407700900123");
  });

  it("gives null without a usable number", () => {
    for (const bad of ["", "   ", null, undefined, "1234", "123456789", "0212345678", "+0712345678", "telefon 41234567", "+47 41+234567", "+1234567890123456"]) {
      expect(internationalPhone(bad)).toBeNull();
    }
  });
});

describe("whatsappDirectUrl", () => {
  it("opens the person's chat with the encoded message", () => {
    const text = "Bună ziua, Ștefan! Linkul: https://exemplu.no/actualizare/abc?x=1&y=2";
    const url = whatsappDirectUrl("41234567", text)!;
    expect(url.startsWith("https://wa.me/4741234567?text=")).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf("?text=") + 6))).toBe(text);
    expect(url).not.toMatch(/[ &]y=2/);
  });

  it("is null without a valid phone", () => {
    expect(whatsappDirectUrl("", "x")).toBeNull();
  });
});
