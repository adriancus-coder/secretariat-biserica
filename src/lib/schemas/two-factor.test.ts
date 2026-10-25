import { describe, expect, it } from "vitest";
import { confirmPasswordSchema, readCode } from "./two-factor";

const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  return f;
};

describe("2FA inputs", () => {
  it("bounds the code before any work", () => {
    expect(readCode(form({ cod: " 123 456 " }))).toEqual({ code: "123 456" });
    expect(readCode(form({}))).toEqual({ error: "Introduceți codul." });
    expect(readCode(form({ cod: "1".repeat(33) }))).toEqual({ error: "Codul este prea lung." });
  });
  it("bounds the re-entered password", () => {
    expect(confirmPasswordSchema.safeParse("x".repeat(201)).success).toBe(false);
    expect(confirmPasswordSchema.safeParse(null).success).toBe(false);
    expect(confirmPasswordSchema.safeParse("secret").success).toBe(true);
  });
});
