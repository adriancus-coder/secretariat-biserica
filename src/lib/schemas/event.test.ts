import { describe, expect, it } from "vitest";
import { eventFormInput, eventSchema } from "./event";

function fd(entries: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("formularul de eveniment", () => {
  it("adună contribuțiile la agapă în ordine, ignorând rândurile goale", () => {
    const input = eventFormInput(
      fd([
        ["titlu", "Ziua Recoltei"],
        ["tip", "Serviciu divin"],
        ["data", "2026-10-04"],
        ["agapaActiva", "on"],
        ["agapaPersoane", "120"],
        ["contrib_cine", "Familia Pop"],
        ["contrib_ce", "cozonac"],
        ["contrib_cine", ""],
        ["contrib_ce", ""],
        ["contrib_cine", ""],
        ["contrib_ce", "apă"],
      ]),
    );
    const r = eventSchema.parse(input);
    expect(r.agapaActiva).toBe(true);
    expect(r.agapaPersoane).toBe(120);
    expect(r.contributii).toEqual([
      { cine: "Familia Pop", ce: "cozonac" },
      { cine: "", ce: "apă" },
    ]);
  });

  it("titlul și data sunt obligatorii; numărul de persoane trebuie să fie întreg", () => {
    const r = eventSchema.safeParse(eventFormInput(fd([["tip", "Agapă"], ["agapaPersoane", "abc"]])));
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["titlu", "data", "agapaPersoane"]));
    expect(eventSchema.parse(eventFormInput(fd([["titlu", "X"], ["tip", "Y"], ["data", "2026-01-01"]]))).agapaActiva).toBe(false);
  });
});
