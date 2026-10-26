import { describe, expect, it } from "vitest";
import { cell, exportFileName, exportRows, selectionTitle, sortForExport, toCsv, type ExportPerson } from "./person-export";

const p = (o: Partial<ExportPerson>): ExportPerson => ({
  id: "x",
  nume: "Pop",
  prenume: "Ioana",
  gen: "F",
  dataNasterii: "2010-05-02",
  statut: "APARTINATOR",
  familie: "",
  familyId: null,
  rudenie: "",
  telefon: "",
  email: "",
  adresa: "",
  dataMembru: null,
  modIntrare: null,
  dataBotez: null,
  botezAn: null,
  botezBiserica: "",
  dataCasatoriei: null,
  necasatorit: false,
  functii: "",
  inComitet: false,
  grupuri: "",
  ...o,
});

describe("person export", () => {
  it("formats the cells (dates dd.mm.yyyy, age at the reference date, labels)", () => {
    const x = p({ botezAn: 2024, inComitet: true, modIntrare: "CERERE_MEMBRALITATE" });
    expect(exportRows([x], ["nume", "gen", "dataNasterii", "varsta", "statut", "botez", "comitet", "modIntrare"], "2026-10-25")).toEqual([
      ["Pop", "Feminin", "02.05.2010", "16", "Aparținător", "2024", "da", "Cerere de membralitate"],
    ]);
    expect(cell(p({ dataNasterii: null }), "varsta", "2026-10-25")).toBe("");
  });

  it("CSV: UTF-8 BOM, ';' separator, quoted when needed, diacritics kept", () => {
    const csv = toCsv(["Nume", "Adresă"], [["Țurcanu", 'Str. "Unirii"; 3']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿Nume;Adresă\r\nȚurcanu;"Str. ""Unirii""; 3"\r\n');
  });

  it("sorts by family (kinship order) or by age; names the file and the selection", () => {
    const list = [
      p({ id: "a", nume: "A", familyId: "f2", familie: "Fam. B", rudenie: "Copil", dataNasterii: "2012-01-01" }),
      p({ id: "b", nume: "B", familyId: null, dataNasterii: null }),
      p({ id: "c", nume: "C", familyId: "f2", familie: "Fam. B", rudenie: "Cap de familie", dataNasterii: "1980-01-01" }),
    ];
    const rank = (r: string) => ["Cap de familie", "Soț/Soție", "Copil"].indexOf(r);
    expect(sortForExport(list, "familii", rank).map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(sortForExport(list, "varsta", rank).map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(exportFileName(["copii-minori", "copii-apartinatori"], "2026-10-25", "xlsx")).toBe("persoane-copii-minori-copii-apartinatori-2026-10-25.xlsx");
    expect(selectionTitle(["copii-minori", "copii-apartinatori"], "oricare")).toBe("Copii minori + Copii ai aparținătorilor (oricare)");
    expect(selectionTitle(["membri"], "toate")).toBe("Membri");
  });

  it("writes the consent columns", () => {
    const x = p({ acorduri: { INFO_NOTE: "DA", PHOTOS: "NU", BIRTHDAY: "RETRAS" } });
    expect(exportRows([x], ["acord_INFO_NOTE", "acord_PHOTOS", "acord_BIRTHDAY", "acord_CONTACT"], "2026-10-25")).toEqual([["confirmată", "Nu", "Retras", "Neexprimat"]]);
  });
});
