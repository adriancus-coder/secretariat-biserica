import { describe, expect, it } from "vitest";
import { parseProposal } from "./data-update";

const yes = { acord_PHOTOS: "da", acord_BIRTHDAY: "nu", acord_CONTACT: "da", acord_DIRECTORY: "nu" };
const child = { id: "k1", nume: "Pop", prenume: "Ana", gen: "F", dataNasterii: "2015-01-01", dataBinecuvantare: "", consents: { PHOTOS: "nu", BIRTHDAY: "da", CONTACT: "nu", DIRECTORY: "nu" } };

describe("data-update proposal", () => {
  it("reads the own data, the children and the answers", () => {
    const r = parseProposal({ nume: "Pop", prenume: "Ion", telefon: "+47 900", nota: "on", ...yes, copii: JSON.stringify([child]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.self).toMatchObject({ nume: "Pop", prenume: "Ion", telefon: "+47 900", dataNasterii: null, botezAn: null });
    expect(r.value.consents).toEqual({ PHOTOS: true, BIRTHDAY: false, CONTACT: true, DIRECTORY: false });
    expect(r.value.children[0]).toMatchObject({ id: "k1", nume: "Pop", consents: { PHOTOS: false, BIRTHDAY: true } });
  });

  it("requires the notice, every answer (no default) and valid children", () => {
    const r = parseProposal({ nume: "", acord_PHOTOS: "da", copii: JSON.stringify([{ ...child, nume: "", consents: { PHOTOS: "da" } }]) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["acord_BIRTHDAY", "acord_CONTACT", "acord_DIRECTORY", "copii.0.consents.BIRTHDAY", "copii.0.consents.CONTACT", "copii.0.consents.DIRECTORY", "copii.0.nume", "nota", "nume"].sort(),
    );
    expect(r.errors.acord_BIRTHDAY).toBe("Alegeți Da sau Nu.");
  });

  it("refuses future dates and more than 15 children", () => {
    const r = parseProposal({ nume: "Pop", nota: "on", ...yes, dataNasterii: "2999-01-01", copii: JSON.stringify(Array(16).fill(child)) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.dataNasterii).toBeTruthy();
    expect(r.errors.copii).toBe("Cel mult 15 copii.");
  });

  it("reads the weekly prayer section only when shown; an unticked box is a no", () => {
    const base = { nume: "Pop", nota: "on", ...yes, copii: "[]" };
    const none = parseProposal(base);
    expect(none.ok && none.value.prayer).toBeUndefined();
    const shown = parseProposal({ ...base, rugaciuneSectiune: "1", rugaciuneCopii: "on" });
    expect(shown.ok && shown.value.prayer).toEqual({ optOut: false, includeChildren: true });
  });
});

