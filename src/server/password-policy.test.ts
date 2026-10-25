import { describe, expect, it } from "vitest";
import { COMMON_PASSWORDS } from "./common-passwords";
import { passwordProblem } from "./password-policy";

describe("password policy", () => {
  it("bundles the 10k list", () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(9000);
    expect(COMMON_PASSWORDS.has("password")).toBe(true);
    expect(COMMON_PASSWORDS.has("qwertyuiop")).toBe(true);
  });
  it("refuses common passwords and personal data", () => {
    expect(passwordProblem("QWERTYUIOP", {})).toMatch(/prea des folosită/);
    expect(passwordProblem("ioana.pop.1988", { email: "ioana.pop@example.org" })).toMatch(/e-mail sau numele/);
    expect(passwordProblem("Mureșan-2026!", { name: "Daniel Mureșan" })).toMatch(/e-mail sau numele/);
    expect(passwordProblem("cer-senin-peste-fiorduri", { email: "ioana.pop@example.org", name: "Ioana Pop" })).toBeNull();
  });
});
