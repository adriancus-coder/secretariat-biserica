import { describe, expect, it } from "vitest";
import { changeData, eventKind, eventPersonsError, familyMinors, registerChanges, suggestedTitle, waitsForRegister, type RegisterPerson } from "./event-persons";

const person = (over: Partial<RegisterPerson> = {}): RegisterPerson => ({
  id: "p1",
  nume: "Pop",
  prenume: "Mia",
  statut: "APARTINATOR",
  dataNasterii: "2026-01-10",
  dataBinecuvantare: null,
  dataBotez: null,
  botezBiserica: "",
  botezLocalitate: "",
  botezOficiant: "",
  dataMembru: null,
  dataCasatoriei: null,
  necasatorit: false,
  dataIesire: null,
  modIesire: null,
  ...over,
});
const church = { nume: "Biserica Maranata", localitate: "Stavanger" };
const ev = { data: "2026-05-03", oficiant: "Pastor X" };

describe("EVENT-PERSONS", () => {
  it("the kind follows the type, case and diacritics ignored", () => {
    expect(eventKind("Binecuvântare copil")).toBe("binecuvantare");
    expect(eventKind("nunta")).toBe("nunta");
    expect(eventKind("Înmormântare")).toBe("inmormantare");
    expect(eventKind("Agapă")).toBeNull();
  });

  it("validations", () => {
    const fam = (id: string) => (id === "a" || id === "b" ? "F" : "G");
    expect(eventPersonsError("binecuvantare", [], fam, "F")).toBe("Alegeți cel puțin un copil.");
    expect(eventPersonsError("binecuvantare", [{ personId: "c", numeLiber: "", rol: "COPIL" }], fam, "F")).toBe("Copiii aleși trebuie să fie în familia aleasă.");
    expect(eventPersonsError("binecuvantare", [{ personId: "a", numeLiber: "", rol: "COPIL" }, { personId: "a", numeLiber: "", rol: "COPIL" }], fam, "F")).toBe("O persoană a fost aleasă de două ori.");
    expect(eventPersonsError("botez", [{ personId: null, numeLiber: "X", rol: "BOTEZAT" }], fam, null)).toBe("Un nume scris liber se poate trece doar la miri.");
    expect(eventPersonsError("nunta", [{ personId: null, numeLiber: "Maria", rol: "MIREASA" }], fam, null)).toBeNull();
    expect(eventPersonsError(null, [{ personId: "a", numeLiber: "", rol: "COPIL" }], fam, null)).toBe("Persoanele nu se potrivesc cu tipul evenimentului.");
    expect(eventPersonsError("binecuvantare", [{ personId: "a", numeLiber: "", rol: "COPIL" }, { personId: "b", numeLiber: "", rol: "COPIL" }], fam, "F")).toBeNull();
  });

  it("the suggested title", () => {
    expect(suggestedTitle("binecuvantare", [{ prenume: "Mia", nume: "Pop" }], "Fam. Pop Ion")).toBe("Binecuvântarea copilului Mia, familia Pop Ion");
    expect(suggestedTitle("binecuvantare", [{ prenume: "Mia", nume: "Pop" }, { prenume: "Dan", nume: "Pop" }], "")).toBe("Binecuvântarea copiilor Mia și Dan");
    expect(suggestedTitle("nunta", [{ prenume: "Vlad", nume: "Rusu" }], "")).toBe("");
  });

  it("the family's minors: under 2 first, an unknown birth date counts as a child, adults left out", () => {
    const m = (prenume: string, dataNasterii: string | null) => ({ id: prenume, nume: "Pop", prenume, dataNasterii });
    expect(familyMinors([m("Tata", "1985-01-01"), m("Dan", "2011-02-01"), m("Mia", "2026-01-10"), m("Ela", "2019-01-01"), m("X", null)], "2026-05-01").map((x) => x.prenume)).toEqual(["Mia", "Ela", "Dan", "X"]);
  });

  it("register changes: an empty field ticked, another value unticked, an equal one not proposed", () => {
    const [c] = registerChanges("binecuvantare", ev, [{ rol: "COPIL", person: person() }], church);
    expect([c.field, c.checked, c.current]).toEqual(["dataBinecuvantare", true, "—"]);
    expect(registerChanges("binecuvantare", ev, [{ rol: "COPIL", person: person({ dataBinecuvantare: "2026-01-01" }) }], church)[0].checked).toBe(false);
    expect(registerChanges("binecuvantare", ev, [{ rol: "COPIL", person: person({ dataBinecuvantare: "2026-05-03" }) }], church)).toEqual([]);
  });

  it("a baptism proposes the church, the locality, the officiant and the membership (unticked for a minor)", () => {
    const minor = registerChanges("botez", ev, [{ rol: "BOTEZAT", person: person({ dataNasterii: "2012-01-01" }) }], church);
    expect(minor.map((c) => c.field)).toEqual(["dataBotez", "botezBiserica", "botezLocalitate", "botezOficiant", "statut"]);
    expect(minor.find((c) => c.field === "statut")!.checked).toBe(false);
    const adult = registerChanges("botez", ev, [{ rol: "BOTEZAT", person: person({ dataNasterii: "1990-01-01", statut: "PRIETEN" }) }], church);
    expect(adult.find((c) => c.field === "statut")!.checked).toBe(true);
    expect(changeData({ field: "statut" }, ev, church)).toEqual({ statut: "MEMBRU", dataMembru: "2026-05-03", modIntrare: "BOTEZ" });
    expect(changeData({ field: "dataBotez" }, ev, church)).toEqual({ dataBotez: "2026-05-03", botezAn: 2026 });
  });

  it("a wedding: the date, not unmarried any more; a funeral: the death", () => {
    const [w] = registerChanges("nunta", ev, [{ rol: "MIRE", person: person({ necasatorit: true }) }], church);
    expect([w.current, w.checked]).toEqual(["Necăsătorit(ă)", true]);
    expect(changeData(w, ev, church)).toEqual({ dataCasatoriei: "2026-05-03", necasatorit: false });
    const [f] = registerChanges("inmormantare", ev, [{ rol: "DECEDAT", person: person() }], church);
    expect(changeData(f, ev, church)).toEqual({ dataIesire: "2026-05-03", modIesire: "DECES" });
  });

  it("waits for the register only after the date, with persons not applied and not ignored", () => {
    const e = { data: "2026-05-03", registruIgnoratLa: null, persoane: [{ personId: "a", aplicatInRegistruLa: null }] };
    expect(waitsForRegister(e, "2026-05-03")).toBe(true);
    expect(waitsForRegister(e, "2026-05-02")).toBe(false);
    expect(waitsForRegister({ ...e, registruIgnoratLa: new Date() }, "2026-06-01")).toBe(false);
    expect(waitsForRegister({ ...e, persoane: [{ personId: null, aplicatInRegistruLa: null }] }, "2026-06-01")).toBe(false);
  });
});
