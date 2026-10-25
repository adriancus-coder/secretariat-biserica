import { describe, expect, it } from "vitest";
import { printToText } from "@/domain/print";
import { contactRestricted } from "./contact-access";
import { dataCopyJson, dataCopyPrint, type DataCopy } from "./data-copy";

const copy: DataCopy = {
  persoana: "Pop Ion",
  generatLa: "2026-11-01",
  sectiuni: [
    { titlu: "Date de registru", campuri: [["Nume", "Pop"], ["Data căsătoriei", ""]] },
    { titlu: "Documente eliberate", tabel: { coloane: ["Nr.", "Data"], randuri: [["3/2026", "01.02.2026"]] } },
    { titlu: "Prezență la ședințe", tabel: { coloane: ["Data"], randuri: [] } },
  ],
};

describe("data copy (art. 15 GDPR)", () => {
  it("leaves empty fields out of the JSON and empty sections out of the PDF", () => {
    expect(dataCopyJson(copy).sectiuni).toEqual([
      { titlu: "Date de registru", campuri: { Nume: "Pop" } },
      { titlu: "Documente eliberate", tabel: { coloane: ["Nr.", "Data"], randuri: [["3/2026", "01.02.2026"]] } },
      { titlu: "Prezență la ședințe", tabel: { coloane: ["Data"], randuri: [] } },
    ]);
    const text = printToText(dataCopyPrint(copy, { nume: "Maranata" } as never));
    expect(text).toContain("Date de registru\nCâmp | Valoare\nNume | Pop");
    expect(text).toContain("Nr. | Data\n3/2026 | 01.02.2026");
    expect(text).not.toContain("Prezență la ședințe");
    expect(text).not.toContain("Data căsătoriei");
  });
});

describe("contact data after an exit", () => {
  it("are restricted to administrators", () => {
    expect(contactRestricted({ dataIesire: "2026-01-01" }, "SECRETAR")).toBe(true);
    expect(contactRestricted({ dataIesire: null, statut: "FOST_MEMBRU" }, "VIZUALIZARE")).toBe(true);
    expect(contactRestricted({ dataIesire: "2026-01-01" }, "ADMIN")).toBe(false);
    expect(contactRestricted({ dataIesire: null, statut: "MEMBRU" }, "SECRETAR")).toBe(false);
  });
});
