/**
 * Teste diferențiale: funcțiile originale din prototip vs. implementarea aplicației,
 * pe sute de registre generate aleator (seed fix → rezultate reproductibile).
 */
import { describe, expect, it } from "vitest";
import { defaultDocumentTitle, generateDocumentText } from "@/domain/documents";
import { buildReportText } from "@/domain/report";
import { computeStats } from "@/domain/stats";
import { inYear } from "@/lib/dates";
import { DOCUMENT_TYPES } from "@/lib/labels";
import { person as makePerson } from "@/domain/test-helpers";
import { loadPrototype, type PrototypeApi } from "../prototype/harness";
import { randomDataset, rng, toPrototypeEvent, toPrototypeMember, type Dataset } from "../prototype/fixtures";

const TODAYS = ["2026-09-28", "2025-01-01", "2024-12-31", "2027-03-15"];

function loadInto(proto: PrototypeApi, ds: Dataset) {
  proto.S.members = Object.fromEntries(ds.persons.map((p) => [p.id, toPrototypeMember(p)]));
  proto.S.events = Object.fromEntries(ds.events.map((e) => [e.id, toPrototypeEvent(e)]));
  proto.S.meetings = Object.fromEntries(ds.meetings.map((m) => [m.id, { ...m }]));
  proto.S.documents = Object.fromEntries(ds.documents.map((d) => [d.id, { ...d }]));
}

const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe("paritate cu prototipul: statistici", () => {
  for (const today of TODAYS) {
    const proto = loadPrototype(today);
    const currentYear = Number(today.slice(0, 4));

    it(`stats() identic pentru 150 de registre aleatoare (azi = ${today})`, () => {
      for (let seed = 1; seed <= 150; seed++) {
        const ds = randomDataset(seed * 7919 + currentYear, today);
        loadInto(proto, ds);
        for (const year of [undefined, currentYear, currentYear - 1, currentYear - 3, 2019, currentYear + 1]) {
          const expected = proto.stats(year);
          const actual = computeStats(ds.persons, ds.events, { year, today });
          const ctx = `seed=${seed} year=${year}`;
          expect(actual.y, ctx).toBe(expected.y);
          expect(actual.endDate, ctx).toBe(expected.endDate);
          for (const key of [
            "ev",
            "membri",
            "copii",
            "copiiMembri",
            "apart",
            "prieteni",
            "botezati",
            "intrTransfer",
            "intrBotez",
            "reprimiri",
            "iesiri",
            "binecuv",
            "nunti",
            "inmorm",
          ] as const) {
            expect(ids(actual[key]), `${ctx} ${key}`).toEqual(ids(expected[key]));
          }
          expect(actual.gen, ctx).toEqual(expected.gen);
          expect(actual.bands, ctx).toEqual(expected.bands);
          expect(actual.fams, ctx).toBe(expected.fams);
        }
      }
    });
  }
});

describe("paritate cu prototipul: darea de seamă", () => {
  for (const today of TODAYS) {
    const proto = loadPrototype(today);
    const currentYear = Number(today.slice(0, 4));

    it(`reportText() identic caracter cu caracter (azi = ${today})`, () => {
      for (let seed = 1; seed <= 120; seed++) {
        const ds = randomDataset(seed * 104729 + currentYear, today, 60);
        loadInto(proto, ds);
        for (const year of [currentYear, currentYear - 1, currentYear - 2, 2020]) {
          const stats = computeStats(ds.persons, ds.events, { year, today });
          const activity = {
            evenimente: ds.events.filter((e) => inYear(e.data, year)).length,
            sedinte: ds.meetings.filter((m) => inYear(m.data, year)).length,
            documente: ds.documents.filter((d) => inYear(d.data, year) && d.tip !== "raport").length,
          };
          expect(buildReportText(year, stats, activity), `seed=${seed} year=${year}`).toBe(proto.reportText(year));
        }
      }
    });
  }
});

const PROTOTYPE_PARENTS = ["Cap de familie", "Soție", "Părinte"];
const APP_PARENTS = ["Cap de familie", "Soție", "Soț"];

function blessingRulesDiffer(person: Dataset["persons"][number], all: Dataset["persons"]): boolean {
  if (PROTOTYPE_PARENTS.includes(person.rudenie)) return true;
  return all.some(
    (p) => p.id !== person.id && p.familie && p.familie === person.familie && PROTOTYPE_PARENTS.includes(p.rudenie) !== APP_PARENTS.includes(p.rudenie),
  );
}

describe("paritate cu prototipul: șabloanele de documente", () => {
  const today = "2026-09-28";
  const proto = loadPrototype(today);
  const churches = [
    { nume: "Maranata Stavanger", adresa: "Kongsgårdbakken 1, Stavanger" },
    { nume: "", adresa: "" },
  ];

  it("textul și titlul generate sunt identice pentru toate tipurile, persoanele și câmpurile", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const ds = randomDataset(seed * 31 + 5, today, 25);
      loadInto(proto, ds);
      const r = rng(seed);
      for (const church of churches) {
        proto.S.settings = { nume: church.nume, adresa: church.adresa };
        const candidates: (Dataset["persons"][number] | null)[] = [null, ...ds.persons];
        for (const person of candidates) {
          for (const tip of DOCUMENT_TYPES) {
            if (tip === "raport") continue; // acoperit de testul dării de seamă
            // Documented deviations in "din părinții …" (see the tests below): the prototype includes
            // the person if they have a parent relation, and takes "Părinte" but not "Soț"; the app
            // takes the family's head and spouse. Only the cases where both rules agree are compared.
            if (tip === "binecuvantare" && person && blessingRulesDiffer(person, ds.persons)) continue;
            const catre = r.chance(0.5) ? "Biserica Betel Oslo" : "";
            const scop = r.chance(0.5) ? "a-i servi la bancă" : "";
            Object.assign(proto.form, { d_tip: tip, d_mb: person?.id ?? "", d_catre: catre, d_scop: scop, d_data: today });
            proto.elements.text.value = "";
            proto.elements.text.dataset = {};
            proto.elements.titlu.value = "";
            proto.genDocText(true, true);
            const text = generateDocumentText({ tip, person, family: ds.persons, church, catre, scop });
            expect(text, `seed=${seed} tip=${tip} person=${person?.id}`).toBe(proto.elements.text.value);
            expect(defaultDocumentTitle(tip, person, catre)).toBe(proto.elements.titlu.value);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("documented deviations from the prototype (families as records)", () => {
  const today = "2026-09-28";
  const proto = loadPrototype(today);

  it("two families with the same name count twice; the prototype counted the name once", () => {
    const persons = [
      makePerson({ id: "a1", nume: "Pop", familyId: "f1", statut: "MEMBRU" }),
      makePerson({ id: "a2", nume: "Pop", familyId: "f1", statut: "MEMBRU" }),
      makePerson({ id: "b1", nume: "Pop", familyId: "f2", statut: "MEMBRU" }),
    ];
    proto.S.members = Object.fromEntries(persons.map((p) => [p.id, toPrototypeMember({ ...p, familie: "Pop" })]));
    proto.S.events = {};
    expect(proto.stats(undefined).fams).toBe(1);
    expect(computeStats(persons, [], { today }).fams).toBe(2);
  });

  it("the blessing certificate names the family's head and spouse, head first; not other parents", () => {
    const child = makePerson({ id: "c", nume: "Pop", prenume: "Ana", familyId: "f", rudenie: "Fiică", gen: "F" });
    const family = [
      makePerson({ id: "m", nume: "Pop", prenume: "Ioana", familyId: "f", rudenie: "Soție" }),
      makePerson({ id: "h", nume: "Pop", prenume: "Vasile", familyId: "f", rudenie: "Cap de familie" }),
      makePerson({ id: "g", nume: "Pop", prenume: "Maria", familyId: "f", rudenie: "Părinte" }),
      makePerson({ id: "x", nume: "Pop", prenume: "Ion", familyId: "other", rudenie: "Cap de familie" }),
      child,
    ];
    const text = generateDocumentText({
      tip: "binecuvantare",
      person: child,
      family,
      familyHeadId: "h",
      church: { nume: "Maranata", adresa: "" },
      catre: "",
      scop: "",
    });
    expect(text).toContain("din părinții Pop Vasile și Pop Ioana,");
  });
});

describe("documented deviations from the prototype (baptism church and officiant)", () => {
  const today = "2026-09-28";
  const proto = loadPrototype(today);
  const church = { nume: "Maranata Stavanger", adresa: "Kongsgårdbakken 1, Stavanger" };
  const base = makePerson({ id: "b", nume: "Pop", prenume: "Ana", gen: "F", dataBotez: "2008-06-15", locBotez: "Oslo", dataMembru: "2010-01-10" });
  const doc = (tip: "botez" | "adeverinta" | "recomandare", person = base) =>
    generateDocumentText({ tip, person, family: [], church, catre: "", scop: "" });
  const protoDoc = (tip: string, person = base) => {
    proto.S.members = { [person.id]: toPrototypeMember({ ...person, familie: "" }) };
    proto.S.settings = church;
    Object.assign(proto.form, { d_tip: tip, d_mb: person.id, d_catre: "", d_scop: "", d_data: today });
    proto.elements.text.value = "";
    proto.elements.text.dataset = {};
    proto.genDocText(true, true);
    return proto.elements.text.value;
  };

  it("without church and officiant the certificates match the prototype", () => {
    for (const tip of ["botez", "adeverinta", "recomandare"] as const) expect(doc(tip)).toBe(protoDoc(tip));
  });

  it("the baptism certificate names the church, its locality and the officiant", () => {
    const full = { ...base, botezBiserica: "Betel", botezOficiant: "Ioan Ardelean" };
    expect(protoDoc("botez", full)).toContain("la data de 15 iunie 2008, la Oslo, în cadrul Biserica Maranata Stavanger.");
    expect(doc("botez", full)).toContain("la data de 15 iunie 2008, în Biserica Betel din Oslo, de către Ioan Ardelean.");
    expect(doc("botez", { ...full, locBotez: "" })).toContain("la data de 15 iunie 2008, în Biserica Betel, de către Ioan Ardelean.");
    expect(doc("botez", { ...base, botezOficiant: "Ioan Ardelean" })).toContain(
      "la data de 15 iunie 2008, la Oslo, în cadrul Biserica Maranata Stavanger, de către Ioan Ardelean.",
    );
  });

  it("the membership certificate and the recommendation mention the baptism church", () => {
    const withChurch = { ...base, botezBiserica: "Biserica Betel Oslo" };
    expect(doc("adeverinta", withChurch)).toContain("fiind botezată în apă la data de 15 iunie 2008, în Biserica Betel Oslo.");
    expect(doc("recomandare", withChurch)).toContain("botezată în apă la 15 iunie 2008, în Biserica Betel Oslo, care");
    expect(doc("adeverinta", { ...withChurch, dataBotez: null })).toContain("fiind botezată în apă, în Biserica Betel Oslo.");
  });

  it("the report adds (church, officiant) to persons baptised in another church", () => {
    const persons = [
      makePerson({ id: "x", nume: "Rusu", prenume: "Ion", dataBotez: "2026-05-01", dataMembru: "2026-05-01", modIntrare: "BOTEZ", botezBiserica: "Betel Oslo", botezOficiant: "Ioan Ardelean" }),
      makePerson({ id: "y", nume: "Lungu", prenume: "Eva", dataBotez: "2026-06-01", dataMembru: "2026-06-01", modIntrare: "BOTEZ", botezBiserica: "Biserica Maranata Stavanger", botezOficiant: "Daniel Mureșan" }),
    ];
    const s = computeStats(persons, [], { year: 2026, today });
    const text = buildReportText(2026, s, { evenimente: 0, sedinte: 0, documente: 0 }, "Maranata Stavanger");
    expect(text).toContain("2 botezați în 2026 (Rusu Ion (Betel Oslo, Ioan Ardelean), Lungu Eva)");
    proto.S.members = Object.fromEntries(persons.map((p) => [p.id, toPrototypeMember({ ...p, familie: "" })]));
    proto.S.events = {};
    expect(proto.reportText(2026)).toContain("2 botezați în 2026 (");
    expect(buildReportText(2026, s, { evenimente: 0, sedinte: 0, documente: 0 })).toContain("Rusu Ion (Betel Oslo, Ioan Ardelean)");
  });
});
