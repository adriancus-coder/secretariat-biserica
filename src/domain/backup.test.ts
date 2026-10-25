import { describe, expect, it } from "vitest";
import { randomDataset, toPrototypeEvent, toPrototypeMember } from "../../tests/prototype/fixtures";
import { legacyStatus, normalizeDocumentNumbers, parsePrototypeJson, toPrototypeJson, type Backup } from "./backup";

const sample: Backup = {
  members: [
    {
      id: "p1",
      nume: "Popescu",
      prenume: "Ion",
      statut: "APARTINATOR",
      gen: "M",
      familie: "Popescu",
      rudenie: "Cap de familie",
      dataNasterii: "1972-04-12",
      telefon: "+47 1",
      email: "ion@example.org",
      adresa: "Str. 1",
      dataMembru: "2006-03-02",
      modIntrare: "NASCUT_IN_BISERICA",
      bisericaProvenienta: "",
      dataBotez: null,
      locBotez: "",
      dataBinecuvantare: null,
      dataIesire: "2025-01-01",
      modIesire: "DECES",
      bisericaDestinatie: "",
      slujire: "diacon",
      note: "rând 1\nrând 2",
      createdAt: "2020-01-01",
    },
  ],
  meetings: [
    {
      id: "m1",
      titlu: "Comitet",
      tip: "Comitet",
      data: "2026-01-10",
      ora: "18:30",
      loc: "Sala",
      presedinte: "D. M.",
      prezenti: ["p1"],
      invitati: "",
      ordine: "1. …",
      discutii: "",
      hotarari: "Se hotărăște.",
      createdAt: "2026-01-10",
    },
  ],
  events: [
    {
      id: "e1",
      titlu: "Agapă",
      tip: "Agapă",
      data: "2026-02-01",
      ora: "",
      loc: "",
      invitat: "",
      responsabil: "",
      descriere: "",
      agapa: { activ: true, responsabil: "Lucia", persoane: 80, contributii: [{ cine: "Fam. Pop", ce: "cozonac" }] },
      createdAt: null,
    },
  ],
  documents: [
    {
      id: "d1",
      tip: "raport",
      nr: 1,
      data: "2026-01-20",
      membruId: null,
      persoana: "",
      catre: "",
      scop: "",
      titlu: "Dare de seamă anuală 2025",
      text: "SITUAȚIA…",
      an: 2025,
      createdAt: "2026-01-20",
    },
  ],
  groups: [{ id: "g1", nume: "Cor", responsabil: "V. P.", descriere: "", membri: ["p1"], createdAt: null }],
  notes: [{ id: "n1", data: "2026-03-01", tip: "Pastorală", persoanaId: "p1", familie: "", text: "Vizită.", createdAt: null }],
  settings: {
    nume: "Maranata",
    adresa: "A",
    orgnr: "1",
    telefon: "2",
    email: "e@x.ro",
    pastor: "P",
    secretar: "S",
    nomen: { tipuriSedinte: ["Comitet"], tipuriEvenimente: [], tipuriMentiuni: [], rudenie: [] },
  },
};

describe("copia de siguranță (format prototip)", () => {
  it("exportul folosește etichetele și câmpurile din prototip", () => {
    const json = toPrototypeJson(sample) as Record<string, Record<string, Record<string, unknown>>>;
    expect(Object.keys(json)).toEqual(["members", "meetings", "events", "documents", "groups", "notes", "settings"]);
    expect(json.members.p1).toMatchObject({
      id: "p1",
      statut: "Aparținător",
      modIntrare: "Născut în biserică",
      modIesire: "Deces",
      dataBotez: "",
      gen: "M",
    });
    expect(json.events.e1.agapa).toEqual({ activ: true, responsabil: "Lucia", persoane: "80", contributii: [{ cine: "Fam. Pop", ce: "cozonac" }] });
    expect(json.documents.d1).toMatchObject({ tip: "raport", nr: 1, an: 2025, membruId: "" });
    expect(json.notes.n1.persoanaId).toBe("p1");
  });

  it("export → import reproduce exact datele", () => {
    const text = JSON.stringify(toPrototypeJson(sample));
    const r = parsePrototypeJson(JSON.parse(text));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.backup).toEqual(sample);
  });

  it("„Cerere de membralitate” is exported and imported by its label", () => {
    const m = { ...sample.members[0], modIntrare: "CERERE_MEMBRALITATE" as const };
    const json = toPrototypeJson({ ...sample, members: [m] });
    expect((Object.values(json.members as Record<string, { modIntrare: string }>)[0]).modIntrare).toBe("Cerere de membralitate");
    const r = parsePrototypeJson(JSON.parse(JSON.stringify(json)));
    expect(r.warnings).toEqual([]);
    expect(r.backup?.members[0].modIntrare).toBe("CERERE_MEMBRALITATE");
  });

  it("importă date în formatul prototipului (generate aleator)", () => {
    const ds = randomDataset(42, "2026-09-28", 50);
    const raw = {
      members: Object.fromEntries(ds.persons.map((p) => [p.id, toPrototypeMember(p)])),
      events: Object.fromEntries(ds.events.map((e) => [e.id, toPrototypeEvent(e)])),
      meetings: {},
      documents: {},
      groups: {},
      notes: {},
      settings: {},
    };
    const r = parsePrototypeJson(raw);
    expect(r.errors).toEqual([]);
    expect(r.backup.members).toHaveLength(ds.persons.length);
    for (const p of ds.persons) {
      const m = r.backup.members.find((x) => x.id === p.id)!;
      expect(m.statut).toBe(p.statut);
      expect(m.modIntrare).toBe(p.modIntrare);
      expect(m.modIesire).toBe(p.modIesire);
      expect(m.dataNasterii).toBe(p.dataNasterii);
      expect(m.createdAt).toBe(p.createdAt);
    }
    expect(r.backup.settings).toBeNull();
  });

  it("raportează erorile care blochează importul și corectează ce se poate", () => {
    const r = parsePrototypeJson({
      members: {
        a1: { nume: "", statut: "Membru" },
        a2: { nume: "Pop", statut: "Pastor", dataNasterii: "31.12.1990", modIntrare: "Adopție" },
      },
      meetings: { m1: { tip: "Comitet", prezenti: ["a2", "necunoscut"] } },
      notes: { n1: { text: "x", createdAt: "2024-01-01" } },
      documents: { d1: { tip: "diploma", text: "" } },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("numele lipsește");
    expect(r.errors.join("\n")).toContain("statut necunoscut „Pastor”");
    expect(r.errors.join("\n")).toContain("„31.12.1990” nu este o dată validă");
    expect(r.errors.join("\n")).toContain("lipsește data");
    expect(r.errors.join("\n")).toContain("tip de document necunoscut „diploma”");
    expect(r.warnings.join("\n")).toContain("„Adopție” a fost înregistrat ca „Altul”");
    expect(r.warnings.join("\n")).toContain("persoana „necunoscut” nu există în fișier");
    expect(r.backup.notes[0].data).toBe("2024-01-01");
  });

  it("respinge fișierele care nu sunt copii de siguranță", () => {
    expect(parsePrototypeJson([1, 2]).ok).toBe(false);
    expect(parsePrototypeJson({ foo: 1 }).ok).toBe(false);
    expect(parsePrototypeJson({ members: { "a b": { nume: "X" } } }).errors[0]).toContain("identificator invalid");
  });

  it("renumerotează documentele fără număr sau cu număr duplicat pe același an", () => {
    const base = sample.documents[0];
    const docs = [
      { ...base, id: "a", nr: 1, data: "2025-01-01" },
      { ...base, id: "b", nr: 1, data: "2025-02-01" },
      { ...base, id: "c", nr: 0, data: "2025-03-01" },
      { ...base, id: "d", nr: 1, data: "2026-01-01" },
    ];
    const { docs: out, renumbered } = normalizeDocumentNumbers(docs, new Map([[2025, new Set([2])]]));
    expect(out.map((x) => [x.id, x.nr])).toEqual([
      ["a", 1],
      ["b", 3],
      ["c", 4],
      ["d", 1],
    ]);
    expect(renumbered).toHaveLength(2);
  });
});

describe("older files: statuses before Statut art. 28", () => {
  it("maps „Copil” and a baptised „Aparținător” by the migration's rules", () => {
    const r = parsePrototypeJson({
      members: {
        t: { nume: "Pop", prenume: "Ion", statut: "Membru", familie: "Pop", rudenie: "Cap de familie" },
        k1: { nume: "Pop", prenume: "Ana", statut: "Copil", familie: "Pop", rudenie: "Fiică" },
        k2: { nume: "Pop", prenume: "Iosif", statut: "Copil", familie: "Pop", dataBotez: "2025-06-01" },
        k3: { nume: "Rus", prenume: "Eva", statut: "Copil", familie: "Rus" },
        a1: { nume: "Ene", prenume: "Dan", statut: "Aparținător", dataBotez: "2010-01-01" },
        a2: { nume: "Ene", prenume: "Ilie", statut: "Aparținător" },
      },
    });
    expect(r.errors).toEqual([]);
    const st = Object.fromEntries(r.backup.members.map((m) => [m.id, m.statut]));
    expect(st).toEqual({ t: "MEMBRU", k1: "APARTINATOR", k2: "MEMBRU", k3: "PRIETEN", a1: "BOTEZAT_FARA_TRANSFER", a2: "APARTINATOR" });
    expect(r.warnings.some((w) => w.includes("Statutul Cultului (art. 28)"))).toBe(true);
  });

  it("legacyStatus follows the same rules", () => {
    expect(legacyStatus("COPIL", true, false)).toBe("MEMBRU");
    expect(legacyStatus("COPIL", false, true)).toBe("APARTINATOR");
    expect(legacyStatus("COPIL", false, false)).toBe("PRIETEN");
    expect(legacyStatus("APARTINATOR", true, false)).toBe("BOTEZAT_FARA_TRANSFER");
  });
});
