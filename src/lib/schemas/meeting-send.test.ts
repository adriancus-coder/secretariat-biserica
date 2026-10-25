import { describe, expect, it } from "vitest";
import { defaultSendSubject, meetingSendSchema, splitAddresses } from "./meeting-send";

const base = { catre: [], alte: "", subiect: "S", mesaj: "M", pdf: true };

describe("meeting send form", () => {
  it("merges chips and free addresses, lower-case and deduplicated", () => {
    const r = meetingSendSchema.safeParse({ ...base, catre: ["Pastor@x.ro", "sec@x.ro"], alte: "pastor@x.ro, ana@y.no;\nion@z.ro" });
    expect(r.success && r.data.to).toEqual(["pastor@x.ro", "sec@x.ro", "ana@y.no", "ion@z.ro"]);
  });

  it("rejects invalid addresses and an empty recipient list", () => {
    const bad = meetingSendSchema.safeParse({ ...base, alte: "ana@y.no, nu-e-adresa" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toContain("nu-e-adresa");
    expect(meetingSendSchema.safeParse(base).error?.issues[0].message).toBe("Alegeți cel puțin un destinatar.");
  });

  it("requires a subject", () => {
    expect(meetingSendSchema.safeParse({ ...base, catre: ["a@x.ro"], subiect: " " }).success).toBe(false);
  });

  it("splits on commas, semicolons, spaces and new lines", () => {
    expect(splitAddresses(" a@x.ro;b@x.ro ,\nc@x.ro  d@x.ro ")).toEqual(["a@x.ro", "b@x.ro", "c@x.ro", "d@x.ro"]);
  });

  it("builds the default subject", () => {
    expect(defaultSendSubject({ nr: 16, anRegistru: 2026, dataLabel: "11.09.2026" }, "Maranata Stavanger")).toBe(
      "Proces-verbal nr. 16/2026 — Maranata Stavanger",
    );
    expect(defaultSendSubject({ nr: null, anRegistru: null, dataLabel: "11.09.2026" }, "")).toBe("Proces-verbal din 11.09.2026");
  });
});
