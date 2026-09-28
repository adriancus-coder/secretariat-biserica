/**
 * Teste diferențiale: funcțiile originale din prototip vs. implementarea aplicației,
 * pe sute de registre generate aleator (seed fix → rezultate reproductibile).
 */
import { describe, expect, it } from "vitest";
import { defaultDocumentTitle, generateDocumentText, type DocPerson } from "@/domain/documents";
import { buildReportText } from "@/domain/report";
import { computeStats } from "@/domain/stats";
import { inYear } from "@/lib/dates";
import { DOCUMENT_TYPES, PARENT_RELATIONS } from "@/lib/labels";
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
        const candidates: (DocPerson | null)[] = [null, ...ds.persons];
        for (const person of candidates) {
          for (const tip of DOCUMENT_TYPES) {
            if (tip === "raport") continue; // acoperit de testul dării de seamă
            // Prototipul include persoana însăși printre „părinți” dacă are grad de părinte;
            // aplicația o exclude (corecție documentată). Comparăm doar cazurile comune.
            if (tip === "binecuvantare" && person && PARENT_RELATIONS.includes(person.rudenie)) continue;
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
