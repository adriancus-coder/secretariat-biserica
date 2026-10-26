import { describe, expect, it } from "vitest";
import { kinGraph, neamuri, relatives, type KinPerson } from "./kinship";
import { externalKey, nameLinkStillValid, nameProposals, type NamedKin } from "./kinship-parents";

const n = (id: string, nume: string, prenume: string, over: Partial<NamedKin> = {}): NamedKin => ({ id, nume, prenume, gen: null, dataNasterii: null, numeTata: "", numeMama: "", ...over });

describe("proposals from the parents' names (Statut art. 14)", () => {
  it("a father in the register found by numeTata (any word order, diacritics, extra spaces) → „X este tatăl lui Y”", () => {
    const persons = [
      n("dumitru", "Ciobanu", "Dumitru", { gen: "M", dataNasterii: "1962-04-02" }),
      n("felix", "Ciobanu", "Felix", { gen: "M", dataNasterii: "1990-03-03", numeTata: "  dumitru   CIOBANU " }),
    ];
    expect(nameProposals(persons, [], [], new Set())).toEqual([
      { kind: "parinte", key: "p:dumitru:felix", parentId: "dumitru", childId: "felix", role: "tata", text: "Ciobanu Dumitru este tatăl lui Ciobanu Felix" },
    ]);
  });

  it("never the wrong gender, a too small age gap, an ambiguous name, an existing link or an ignored proposal", () => {
    const felix = n("felix", "Ciobanu", "Felix", { gen: "M", dataNasterii: "1990-03-03", numeTata: "Ciobanu Dumitru" });
    expect(nameProposals([n("d", "Ciobanu", "Dumitru", { gen: "F" }), felix], [], [], new Set())).toEqual([]);
    expect(nameProposals([n("d", "Ciobanu", "Dumitru", { gen: "M", dataNasterii: "1985-01-01" }), felix], [], [], new Set())).toEqual([]);
    expect(nameProposals([n("d1", "Ciobanu", "Dumitru", { gen: "M" }), n("d2", "Ciobanu", "Dumitru", { gen: "M" }), felix], [], [], new Set())).toEqual([]);
    const d = n("d", "Ciobanu", "Dumitru", { gen: "M" });
    expect(nameProposals([d, felix], [{ parentId: "d", childId: "felix" }], [], new Set())).toEqual([]);
    expect(nameProposals([d, felix], [], [], new Set(["p:d:felix"]))).toEqual([]);
  });

  it("two heads of family with the same father's and mother's names, the parents outside the register → siblings", () => {
    const persons = [
      n("ion", "Ciobanu", "Ion", { gen: "M", numeTata: "Ciobanu Petru", numeMama: "Ciobanu Ana" }),
      n("vasile", "Ciobanu", "Vasile", { gen: "M", numeTata: "Petru Ciobanu", numeMama: "Ana Ciobanu" }),
    ];
    const [p] = nameProposals(persons, [], [], new Set());
    expect(p).toMatchObject({ kind: "frati", childIds: ["ion", "vasile"], tata: "Ciobanu Petru", mama: "Ciobanu Ana" });
    expect(p.text).toBe("Ciobanu Ion și Ciobanu Vasile sunt frați, cu părinții în afara registrului Ciobanu Petru și Ciobanu Ana");
  });

  it("the same father's name and the surname in it, the mother's name missing → siblings by the father", () => {
    const persons = [n("a", "Pop", "Ion", { numeTata: "Pop Vasile" }), n("b", "Pop", "Ana", { numeTata: "Pop Vasile", numeMama: "Pop Maria" })];
    expect(nameProposals(persons, [], [], new Set())).toMatchObject([{ kind: "frati", childIds: ["a", "b"], tata: "Pop Vasile", mama: null }]);
  });

  it("identical names without kinship (same father's name, different mothers' names) → no proposal", () => {
    const persons = [n("a", "Pop", "Ion", { numeTata: "Pop Vasile", numeMama: "Pop Maria" }), n("b", "Pop", "Ana", { numeTata: "Pop Vasile", numeMama: "Lupu Elena" })];
    expect(nameProposals(persons, [], [], new Set())).toEqual([]);
    // Nor when the surname is not in the father's name and the mothers' names are missing.
    expect(nameProposals([n("a", "Pop", "Ion", { numeTata: "Lupu Vasile" }), n("b", "Rusu", "Ana", { numeTata: "Lupu Vasile" })], [], [], new Set())).toEqual([]);
  });

  it("a parent outside the register already known: a younger brother is proposed as its child", () => {
    const ext = { key: externalKey("p1"), nume: "Ciobanu Petru", gen: "M" as const };
    const persons = [n("ion", "Ciobanu", "Ion", { numeTata: "Ciobanu Petru" }), n("dan", "Ciobanu", "Dan", { numeTata: "Petru Ciobanu" })];
    const props = nameProposals(persons, [{ parentId: ext.key, childId: "ion" }], [ext], new Set());
    expect(props).toEqual([
      { kind: "extern", key: `e:${ext.key}:dan`, externalKey: ext.key, childId: "dan", role: "tata", text: "Ciobanu Dan este copilul lui Ciobanu Petru (nu e în registru), ca frații săi" },
    ]);
  });

  it("a link from the names stays valid only while the file carries the name", () => {
    const felix = n("felix", "Ciobanu", "Felix", { numeTata: "Ciobanu Dumitru" });
    expect(nameLinkStillValid(felix, { nume: "Ciobanu", prenume: "Dumitru", gen: "M" })).toBe(true);
    expect(nameLinkStillValid({ ...felix, numeTata: "Ciobanu Petru" }, { nume: "Ciobanu", prenume: "Dumitru", gen: "M" })).toBe(false);
    expect(nameLinkStillValid({ ...felix, numeTata: "" }, { nume: "Ciobanu Dumitru", gen: "M" })).toBe(false);
  });
});

describe("a parent outside the register in the graph", () => {
  const p = (id: string, over: Partial<KinPerson> = {}): KinPerson => ({ id, nume: "Ciobanu", prenume: id, gen: "M", familyId: null, dataNasterii: null, active: true, statut: "MEMBRU", ...over });
  const petru = externalKey("petru");
  const persons = [
    p(petru, { nume: "Ciobanu Petru", prenume: "", active: false, external: true }),
    p("Ion", { familyId: "fI", isHead: true }),
    p("Vasile", { familyId: "fV", isHead: true }),
    p("Ana", { familyId: "fI", statut: "APARTINATOR" }),
    p("Dan", { familyId: "fV", statut: "APARTINATOR" }),
  ];
  const links = [
    { parentId: petru, childId: "Ion" },
    { parentId: petru, childId: "Vasile" },
    { parentId: "Ion", childId: "Ana" },
    { parentId: "Vasile", childId: "Dan" },
  ];
  const g = kinGraph(persons, links, []);

  it("two heads of family with the same father outside the register are brothers; their children cousins", () => {
    expect(relatives(g, "Ion").frati).toEqual(["Vasile"]);
    expect(relatives(g, "Ana").veri).toEqual(["Dan"]);
    expect(relatives(g, "Ana").unchi).toEqual(["Vasile"]);
    expect(relatives(g, "Ana").bunici).toEqual([petru]);
  });

  it("one neam of two families, named after the father outside the register (not counted as a person)", () => {
    const [neam, ...rest] = neamuri(g);
    expect(rest).toEqual([]);
    expect([neam.name, neam.persons, neam.families, neam.generations]).toEqual(["Neamul Ciobanu Petru", 4, 2, 3]);
  });
});
