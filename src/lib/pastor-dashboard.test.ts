import { describe, expect, it } from "vitest";
import { assemblyCard, birthdaysCard, mandateCard } from "./pastor-dashboard";

describe("pastor dashboard cards", () => {
  it("committee mandate: missing date, running, soon, expired", () => {
    expect(mandateCard("2026-10-26", null, false)).toMatchObject({ value: "—", alert: true });
    expect(mandateCard("2026-10-26", "2024-03-01", false)).toEqual({ value: "până la 1 martie 2029", detail: "ales la 1 martie 2024", alert: false });
    expect(mandateCard("2026-10-26", "2021-12-01", false).alert).toBe(true);
    expect(mandateCard("2026-10-26", "2021-01-10", false)).toMatchObject({ value: "Expirat", alert: true });
    expect(mandateCard("2026-10-26", "2021-01-10", true).value).toBe("până la 10 ianuarie 2031");
  });

  it("ordinary General Assembly of the year", () => {
    expect(assemblyCard("2026-10-26", ["2026-03-01", "2026-05-10"])).toEqual({ value: "Ținută", detail: "la 10 mai 2026" });
    expect(assemblyCard("2026-10-26", [])).toMatchObject({ value: "Nu încă", alert: true });
    expect(assemblyCard("2026-04-02", []).alert).toBe(false);
  });

  it("birthdays this month and the next 7 days", () => {
    const r = birthdaysCard("2026-10-26", [
      { name: "Ana", dataNasterii: "1990-10-27" },
      { name: "Ion", dataNasterii: "1980-10-02" },
      { name: "Maria", dataNasterii: "2001-10-31" },
    ]);
    expect(r).toEqual({ value: "3", detail: "în 7 zile: Ana (27), Maria (31)" });
    expect(birthdaysCard("2026-10-26", []).detail).toBe("niciuna în următoarele 7 zile");
  });
});
