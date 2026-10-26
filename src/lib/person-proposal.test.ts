import { describe, expect, it } from "vitest";
import { entriesFormData, formEntries, proposalChanges, proposalKind } from "./person-proposal";

describe("pastor proposals", () => {
  it("stores the person form without the control fields and replays it", () => {
    const fd = new FormData();
    fd.set("nume", "Pop");
    fd.set("cerere", "x");
    fd.set("fortat", "1");
    fd.set("$ACTION_ID_abc", "");
    fd.set("functii", "[]");
    fd.append("fisier", new Blob(["x"]), "a.txt");
    const stored = formEntries(fd);
    expect(stored).toEqual({ nume: "Pop", functii: "[]" });
    const back = entriesFormData(stored, { cerere: "app1" });
    expect(Object.fromEntries(back)).toEqual({ nume: "Pop", functii: "[]", cerere: "app1" });
    expect([...entriesFormData({ propunere: "p", n: 3, ok: "da" }).keys()]).toEqual(["ok"]);
    expect([...entriesFormData(null).keys()]).toEqual([]);
  });

  it("only a new reabilitare entry or excludere exit needs the pastor", () => {
    const none = { modIntrare: null, modIesire: null };
    expect(proposalKind(null, { modIntrare: "REPRIMIRE", modIesire: null })).toBe("REABILITARE");
    expect(proposalKind(null, { modIntrare: "BOTEZ", modIesire: null })).toBeNull();
    expect(proposalKind(none, { modIntrare: null, modIesire: "EXCLUDERE", dataIesire: "2026-05-01" })).toBe("EXCLUDERE");
    expect(proposalKind({ modIntrare: null, modIesire: "EXCLUDERE", dataIesire: "2026-05-01" }, { modIntrare: null, modIesire: "EXCLUDERE", dataIesire: "2026-05-01" })).toBeNull();
    expect(proposalKind({ modIntrare: null, modIesire: "EXCLUDERE", dataIesire: "2026-05-01" }, { modIntrare: null, modIesire: "EXCLUDERE", dataIesire: "2026-06-01" })).toBe("EXCLUDERE");
    expect(proposalKind({ modIntrare: "REPRIMIRE", dataMembru: "2020-01-01", modIesire: null }, { modIntrare: "REPRIMIRE", dataMembru: "2020-01-01", modIesire: "DECES" })).toBeNull();
    expect(proposalKind({ modIntrare: "REPRIMIRE", modIesire: null }, { modIntrare: "BOTEZ", modIesire: null })).toBeNull();
  });
});

describe("proposal changes", () => {
  it("lists the key fields that change and counts the others", () => {
    const current = { statut: "FOST_MEMBRU", modIntrare: "BOTEZ", dataMembru: "2001-01-01", telefon: "1", note: "" };
    const proposed = { statut: "MEMBRU", modIntrare: "REPRIMIRE", dataMembru: "2026-05-01", telefon: "2", note: "x", functii: "[]" };
    const r = proposalChanges(current, proposed);
    expect(r.changes.map((c) => c.field)).toEqual(["statut", "modIntrare", "dataMembru"]);
    expect(r.others).toBe(2);
    expect(proposalChanges(null, { modIntrare: "REPRIMIRE" })).toEqual({ changes: [{ field: "modIntrare", before: "", after: "REPRIMIRE" }], others: 0 });
  });
});
