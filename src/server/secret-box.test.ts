import { describe, expect, it } from "vitest";
import { deriveKey, seal, unseal } from "./secret-box";

describe("secret box", () => {
  it("round-trips, never shows the plain text, and refuses another key or a changed text", () => {
    const k = deriveKey("secret-a", "pastoral-note-v1");
    const enc = seal(k, "Vizită la spital, rugăciune.");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("spital");
    expect(seal(k, "x")).not.toBe(seal(k, "x"));
    expect(unseal(k, enc)).toBe("Vizită la spital, rugăciune.");
    expect(() => unseal(deriveKey("secret-b", "pastoral-note-v1"), enc)).toThrow();
    expect(() => unseal(deriveKey("secret-a", "totp-secret-v1"), enc)).toThrow();
    const parts = enc.split(".");
    parts[3] = Buffer.from("altceva").toString("base64url");
    expect(() => unseal(k, parts.join("."))).toThrow();
  });
});
