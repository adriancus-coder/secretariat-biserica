import { describe, expect, it } from "vitest";
import { computeStats, isInRecord, percentOf, reportYears, statsEndDate } from "./stats";
import { event, person } from "./test-helpers";

const TODAY = "2026-09-28";
const names = (list: { nume: string; prenume: string }[]) => list.map((p) => `${p.nume} ${p.prenume}`.trim());

describe("data situației", () => {
  it("anul curent și anii viitori → azi; anii trecuți → 31 decembrie", () => {
    expect(statsEndDate(TODAY)).toBe(TODAY);
    expect(statsEndDate(TODAY, 2026)).toBe(TODAY);
    expect(statsEndDate(TODAY, 2027)).toBe(TODAY);
    expect(statsEndDate(TODAY, 2024)).toBe("2024-12-31");
  });
});

describe("persoane în evidență la o dată", () => {
  it("intrarea și ieșirea determină apartenența retroactiv", () => {
    const p = person({ nume: "Pop", dataMembru: "2019-05-01", dataIesire: "2024-03-10", createdAt: "2026-01-15" });
    expect(isInRecord(p, "2018-12-31", true)).toBe(false); // încă nu intrase
    expect(isInRecord(p, "2019-12-31", true)).toBe(true);
    expect(isInRecord(p, "2023-12-31", true)).toBe(true);
    expect(isInRecord(p, "2024-03-10", true)).toBe(false); // ziua ieșirii nu mai contează
    expect(isInRecord(p, TODAY, false)).toBe(false);
  });

  it("corecție față de prototip: data de intrare are prioritate față de data înregistrării în aplicație", () => {
    // Registru introdus în aplicație în 2026, cu istoric din 2015: darea de seamă pe 2024 îl include.
    const p = person({ nume: "Avram", dataMembru: "2015-06-01", createdAt: "2026-02-01" });
    expect(isInRecord(p, "2024-12-31", true)).toBe(true);
  });

  it("fără dată de intrare, anii trecuți se bazează pe data înregistrării (ca în prototip)", () => {
    const p = person({ nume: "Prieten", statut: "PRIETEN", createdAt: "2025-05-01" });
    expect(isInRecord(p, "2024-12-31", true)).toBe(false);
    expect(isInRecord(p, "2025-12-31", true)).toBe(true);
    expect(isInRecord(p, TODAY, false)).toBe(true);
  });

  it("o persoană născută după data situației nu era în evidență", () => {
    const p = person({ nume: "Nou", statut: "COPIL", dataNasterii: "2025-02-01", createdAt: null });
    expect(isInRecord(p, "2024-12-31", true)).toBe(false);
    expect(isInRecord(p, TODAY, false)).toBe(true);
  });
});

describe("computeStats", () => {
  const persons = [
    person({ id: "a", nume: "Popescu", prenume: "Ion", gen: "M", familie: "Popescu", rudenie: "Cap de familie", dataNasterii: "1975-04-02", dataMembru: "2001-06-10", modIntrare: "BOTEZ", dataBotez: "2001-06-10" }),
    person({ id: "b", nume: "Popescu", prenume: "Maria", gen: "F", familie: "Popescu", rudenie: "Soție", dataNasterii: "1978-11-20", dataMembru: "2003-05-01", modIntrare: "TRANSFER", dataBotez: "1996-07-07" }),
    person({ id: "c", nume: "Popescu", prenume: "Andrei", gen: "M", statut: "COPIL", familie: "Popescu", rudenie: "Fiu", dataNasterii: "2012-03-15", dataBinecuvantare: "2012-09-02" }),
    person({ id: "d", nume: "Ionescu", prenume: "Elena", gen: "F", statut: "APARTINATOR", familie: "Ionescu", dataNasterii: "1990-01-01", dataMembru: "2018-01-01", dataBotez: "2010-08-15" }),
    person({ id: "e", nume: "Ionescu", prenume: "Rut", gen: "F", statut: "COPIL", familie: "Ionescu", dataNasterii: "2019-10-10" }),
    person({ id: "f", nume: "Barbu", prenume: "Petru", gen: "M", statut: "PRIETEN", dataNasterii: "1960-02-29", createdAt: "2021-03-01" }),
    person({ id: "g", nume: "Lungu", prenume: "Mihai", gen: "M", statut: "FOST_MEMBRU", familie: "Lungu", dataNasterii: "1985-05-05", dataMembru: "2010-01-01", dataBotez: "2010-01-01", dataIesire: "2026-02-01", modIesire: "TRANSFER", bisericaDestinatie: "Biserica Betel Oslo" }),
    person({ id: "h", nume: "Avram", prenume: "Ana", gen: "F", statut: "MEMBRU", dataNasterii: "1940-01-01", dataMembru: "1960-01-01", dataBotez: "1960-01-01", dataIesire: "2026-05-05", modIesire: "DECES" }),
    person({ id: "i", nume: "Munteanu", prenume: "Daniel", gen: "M", familie: "Munteanu", dataNasterii: "2000-12-12", dataMembru: "2026-04-20", modIntrare: "BOTEZ", dataBotez: "2026-04-20" }),
    person({ id: "j", nume: "Stan", prenume: "Ioana", gen: "F", dataNasterii: "1999-01-01", dataMembru: "2026-06-01", modIntrare: "REPRIMIRE" }),
  ];
  const events = [
    event({ tip: "Nuntă", data: "2026-07-11", titlu: "Nunta Munteanu–Stan" }),
    event({ tip: "Înmormântare", data: "2026-05-08", titlu: "Înmormântare Ana Avram" }),
    event({ tip: "Nuntă", data: "2025-07-11", titlu: "Nunta de anul trecut" }),
    event({ tip: "Evanghelizare", data: "2026-03-01" }),
  ];

  it("situația la zi (tabloul de bord)", () => {
    const s = computeStats(persons, events, { today: TODAY });
    expect(s.y).toBe(2026);
    expect(names(s.ev)).toEqual([
      "Popescu Ion",
      "Popescu Maria",
      "Popescu Andrei",
      "Ionescu Elena",
      "Ionescu Rut",
      "Barbu Petru",
      "Munteanu Daniel",
      "Stan Ioana",
    ]);
    expect(names(s.membri)).toEqual(["Popescu Ion", "Popescu Maria", "Munteanu Daniel", "Stan Ioana"]);
    expect(percentOf(s.membri.length, s.ev.length)).toBe(50);
    expect(names(s.copii)).toEqual(["Popescu Andrei", "Ionescu Rut"]);
    // Rut e minoră, dar familia Ionescu nu are membri (Elena e aparținătoare).
    expect(names(s.copiiMembri)).toEqual(["Popescu Andrei"]);
    expect(names(s.apart)).toEqual(["Ionescu Elena"]);
    expect(names(s.prieteni)).toEqual(["Barbu Petru"]);
    expect(names(s.botezati)).toEqual(["Popescu Ion", "Popescu Maria", "Ionescu Elena", "Munteanu Daniel"]);
    expect(s.gen).toEqual({ M: 4, F: 4 });
    expect(s.fams).toBe(3); // Popescu, Ionescu, Munteanu
    expect(s.bands).toEqual([
      ["0–17", 2],
      ["18–30", 2],
      ["31–45", 1],
      ["46–60", 2],
      ["61+", 1],
    ]);
  });

  it("mișcarea anului", () => {
    const s = computeStats(persons, events, { today: TODAY });
    expect(names(s.intrBotez)).toEqual(["Munteanu Daniel"]);
    expect(names(s.intrTransfer)).toEqual([]);
    expect(names(s.reprimiri)).toEqual(["Stan Ioana"]);
    expect(names(s.iesiri)).toEqual(["Lungu Mihai", "Avram Ana"]);
    expect(s.nunti.map((e) => e.titlu)).toEqual(["Nunta Munteanu–Stan"]);
    expect(s.inmorm.map((e) => e.titlu)).toEqual(["Înmormântare Ana Avram"]);
  });

  it("situația retroactivă la 31.12.2025", () => {
    const s = computeStats(persons, events, { year: 2025, today: TODAY });
    expect(s.endDate).toBe("2025-12-31");
    // Lungu (ieșit în 2026) și Avram (decedată în 2026) erau încă membri; Munteanu și Stan încă nu intraseră.
    expect(names(s.membri)).toEqual(["Popescu Ion", "Popescu Maria", "Lungu Mihai", "Avram Ana"]);
    expect(s.ev).toHaveLength(8);
    expect(s.nunti.map((e) => e.titlu)).toEqual(["Nunta de anul trecut"]);
    expect(s.iesiri).toHaveLength(0);
  });

  it("vârsta se calculează la data situației", () => {
    // Andrei (n. 15.03.2012): 13 ani la 31.12.2025, 14 la zi → minor în ambele cazuri.
    const born2008 = person({ nume: "Tânăr", dataNasterii: "2008-06-01", dataMembru: "2020-01-01" });
    expect(computeStats([born2008], [], { year: 2025, today: TODAY }).copii).toHaveLength(1);
    expect(computeStats([born2008], [], { today: TODAY }).copii).toHaveLength(0);
  });

  it("fără dată de naștere, statutul „Copil” înseamnă minor", () => {
    const s = computeStats([person({ nume: "X", statut: "COPIL" })], [], { today: TODAY });
    expect(s.copii).toHaveLength(1);
    expect(s.bands.every(([, n]) => n === 0)).toBe(true);
  });
});

describe("reportYears", () => {
  it("anii din date, descrescător, plus anul curent", () => {
    const ps = [person({ nume: "A", dataMembru: "2019-01-01", dataBotez: "2021-02-02" }), person({ nume: "B", dataIesire: "2024-05-05" })];
    expect(reportYears(ps, 2026)).toEqual([2026, 2024, 2021, 2019]);
  });
});
