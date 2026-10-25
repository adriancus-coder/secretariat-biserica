import { describe, expect, it } from "vitest";
import { documentPrint, printToText } from "@/domain/print";
import { addDocumentExtras, exportedState, parseDocumentExtras } from "./document-backup";

const church = { nume: "Biserica Test", adresa: "", orgNr: "", telefon: "", email: "", pastor: "Ion Pastor", secretar: "Ana Secretar" };

describe("document approval", () => {
  it("an approved document exports no state; a sent one comes back as a draft", () => {
    expect(exportedState("APROBAT", "")).toEqual({});
    expect(exportedState("DE_SEMNAT", "")).toEqual({ stare: "CIORNA" });
    expect(exportedState("RESPINS", "Data greșită")).toEqual({ stare: "RESPINS", motivRespingere: "Data greșită" });
    const docs: Record<string, Record<string, unknown>> = { a: { id: "a" }, b: { id: "b" } };
    addDocumentExtras(docs, new Map([["b", exportedState("RESPINS", "x")]]));
    expect(docs.a.stare).toBeUndefined();
    const back = parseDocumentExtras({ documents: docs });
    expect(back.get("a")).toBeUndefined();
    expect(back.get("b")).toEqual({ stare: "RESPINS", motivRespingere: "x" });
    expect(parseDocumentExtras({ documents: [{ id: "c", stare: "DE_SEMNAT" }, { id: "d", stare: "ORICE" }] })).toEqual(new Map([["c", { stare: "CIORNA" }]]));
  });

  it("a draft carries the mark in the print", () => {
    const draft = printToText(documentPrint({ tip: "adeverinta", nr: 7, data: "2026-04-10", text: "Text.", watermark: "CIORNĂ — neaprobat" }, church));
    expect(draft).toContain("[CIORNĂ — neaprobat]");
    expect(printToText(documentPrint({ tip: "adeverinta", nr: 7, data: "2026-04-10", text: "Text." }, church))).not.toContain("CIORNĂ");
  });
});
