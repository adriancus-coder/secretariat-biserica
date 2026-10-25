import { describe, expect, it } from "vitest";
import { applicationLinkSendSchema } from "./application-link";

describe("applicationLinkSendSchema", () => {
  it("accepts several addresses, lower-cased and deduplicated", () => {
    const r = applicationLinkSendSchema.parse({ adrese: "Ana@Example.org, ion@example.no\nana@example.org", nota: "M" });
    expect(r.to).toEqual(["ana@example.org", "ion@example.no"]);
  });

  it("reports an invalid or missing address on the field", () => {
    for (const adrese of ["ana@example.org, nu-e-adresa", "  "]) {
      const r = applicationLinkSendSchema.safeParse({ adrese, nota: "M" });
      expect(r.success).toBe(false);
      expect(r.error!.issues.map((i) => i.path[0])).toEqual(["adrese"]);
    }
  });

  it("caps the note at 1000 characters", () => {
    expect(applicationLinkSendSchema.safeParse({ adrese: "a@b.ro", nota: "x".repeat(1001) }).success).toBe(false);
  });
});
