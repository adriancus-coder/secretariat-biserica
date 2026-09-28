import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "./password";

describe("parole", () => {
  it("hash-ul verifică parola corectă și respinge alta", async () => {
    const h = await hashPassword("Secretariat#2026");
    expect(h.startsWith("scrypt$32768$8$3$")).toBe(true);
    expect(await verifyPassword("Secretariat#2026", h)).toBe(true);
    expect(await verifyPassword("secretariat#2026", h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
  });

  it("hash-uri diferite pentru aceeași parolă (sare aleatoare)", async () => {
    expect(await hashPassword("abcdefgh")).not.toBe(await hashPassword("abcdefgh"));
  });

  it("respinge formate necunoscute", async () => {
    expect(await verifyPassword("x", "bcrypt$abc")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(needsRehash("scrypt$16384$8$1$a$b")).toBe(true);
  });
});
