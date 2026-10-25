import { describe, expect, it } from "vitest";
import { generateDocumentText } from "@/domain/documents";
import { toDocPerson, toPersonRecord, type PersonRecordRow } from "./mappers";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const row = {
  id: "p1",
  nume: "Pop",
  prenume: "Ion",
  statut: "MEMBRU",
  gen: "M",
  familyId: null,
  rudenie: "",
  dataNasterii: d("1980-08-17"),
  dataMembru: d("2000-05-01"),
  modIntrare: "BOTEZ",
  bisericaProvenienta: "",
  dataBotez: d("2000-05-01"),
  botezAn: 2000,
  botezBiserica: "",
  botezLocalitate: "",
  botezOficiant: "",
  dataBinecuvantare: null,
  dataIesire: null,
  modIesire: null,
  bisericaDestinatie: "",
  createdAt: d("2026-01-01"),
  plecatDin: null,
  numeTata: "Vasile Pop",
  numeMama: "Ana Pop",
} as unknown as PersonRecordRow;

describe("toDocPerson", () => {
  it("takes only the parents' names from the row (its dates stay ISO strings)", () => {
    const p = toDocPerson(toPersonRecord(row), row);
    expect(p.dataNasterii).toBe("1980-08-17");
    expect(p.dataMembru).toBe("2000-05-01");
    expect(p.numeTata).toBe("Vasile Pop");
    const church = { nume: "Maranata", adresa: "Str. 1", orgNr: "", telefon: "", email: "", pastor: "", secretar: "" };
    const text = generateDocumentText({ tip: "adeverinta", person: p, family: [], familyHeadId: null, church, catre: "", scop: "" } as never);
    expect(text).toContain("născut la data de 17 august 1980");
  });
});
