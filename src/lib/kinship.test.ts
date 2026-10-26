import { describe, expect, it } from "vitest";
import { AGE_GAP_ERROR, familyLinks, kinGraph, linkViolations, SAME_FAMILY_ERROR, SIBLINGS_ERROR, neamTree, neamuri, parentLinkError, relativeName, relatives, type KinLink, type KinPerson } from "./kinship";

const TODAY = "2026-10-28";
const p = (id: string, over: Partial<KinPerson> = {}): KinPerson => ({ id, nume: "Ciobanu", prenume: id, gen: null, familyId: null, dataNasterii: null, active: true, statut: "MEMBRU", ...over });
const link = (parentId: string, childId: string): KinLink => ({ parentId, childId });

/*
 * Ciobanu Dumitru + Elena (family fD) have Felix (fF, married to Ana) and Maria (fM, married to Petru
 * Pop). Felix and Ana have Iosif; Maria and Petru have Sara. Ana's father Vasile Lupu (fL) is in the
 * register too. Three generations, four families.
 */
const persons = [
  p("Dumitru", { gen: "M", familyId: "fD", isHead: true, dataNasterii: "1950-01-01" }),
  p("Elena", { gen: "F", familyId: "fD", dataNasterii: "1952-01-01" }),
  p("Felix", { gen: "M", familyId: "fF", isHead: true }),
  p("Ana", { gen: "F", familyId: "fF" }),
  p("Maria", { gen: "F", familyId: "fM" }),
  p("Petru", { nume: "Pop", gen: "M", familyId: "fM", isHead: true }),
  p("Iosif", { gen: "M", familyId: "fF", statut: "APARTINATOR" }),
  p("Sara", { nume: "Pop", gen: "F", familyId: "fM", statut: "APARTINATOR" }),
  p("Vasile", { nume: "Lupu", gen: "M", familyId: "fL", isHead: true }),
];
const links = [
  link("Dumitru", "Felix"),
  link("Elena", "Felix"),
  link("Dumitru", "Maria"),
  link("Elena", "Maria"),
  link("Felix", "Iosif"),
  link("Ana", "Iosif"),
  link("Maria", "Sara"),
  link("Petru", "Sara"),
  link("Vasile", "Ana"),
];
const couples: [string, string][] = [
  ["Dumitru", "Elena"],
  ["Felix", "Ana"],
  ["Petru", "Maria"],
];
const g = kinGraph(persons, links, couples);

describe("deduced relatives", () => {
  it("siblings share at least one parent", () => {
    expect(relatives(g, "Felix").frati).toEqual(["Maria"]);
    expect(relatives(g, "Maria").frati).toEqual(["Felix"]);
  });

  it("grandparents and grandchildren", () => {
    expect(relatives(g, "Iosif").bunici.sort()).toEqual(["Dumitru", "Elena", "Vasile"]);
    expect(relatives(g, "Dumitru").nepoti.sort()).toEqual(["Iosif", "Sara"]);
  });

  it("uncles and aunts, cousins", () => {
    expect(relatives(g, "Iosif").unchi).toEqual(["Maria"]);
    expect(relatives(g, "Iosif").veri).toEqual(["Sara"]);
    expect(relatives(g, "Sara").veri).toEqual(["Iosif"]);
  });

  it("in-laws through the spouse of the family: socri, ginere, noră", () => {
    expect(relatives(g, "Ana").socri.sort()).toEqual(["Dumitru", "Elena"]);
    expect(relatives(g, "Felix").socri).toEqual(["Vasile"]);
    expect(relatives(g, "Dumitru").gineri.sort()).toEqual(["Ana", "Petru"]);
    expect([relativeName("gineri", "M"), relativeName("gineri", "F"), relativeName("frati", null)]).toEqual(["ginere", "noră", "frate/soră"]);
  });

  it("each person once, never oneself", () => {
    const all = Object.values(relatives(g, "Felix")).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("Felix");
    expect(all).not.toContain("Ana"); // the spouse is the family, not a deduced relative
  });
});

describe("link rules", () => {
  it("refuses a cycle, a third parent, oneself and a duplicate", () => {
    expect(parentLinkError(links, "Iosif", "Dumitru")).toBe("Legătura ar face din persoană strămoșul propriului părinte.");
    expect(parentLinkError(links, "Felix", "Dumitru")).toBe("Legătura ar face din persoană strămoșul propriului părinte.");
    expect(parentLinkError(links, "Vasile", "Felix")).toBe("Persoana are deja doi părinți în registru.");
    expect(parentLinkError(links, "Felix", "Felix")).toBe("O persoană nu poate fi propriul părinte.");
    expect(parentLinkError(links, "Felix", "Iosif")).toBe("Legătura există deja.");
    expect(parentLinkError(links, "Vasile", "Petru")).toBeNull();
  });

  it("family links: Fiu / Fiică / Copil become children of the head and Soț / Soție only", () => {
    const m = (id: string, rudenie: string, extra: object = {}) => ({ id, rudenie, dataNasterii: null, ...extra });
    const members = [m("h", "Cap de familie"), m("w", "Soție"), m("s", "Fiu"), m("d", "Fiică", { dataNasterii: "1990-01-01" }), m("g", "Nepot"), m("b", "Părinte")];
    expect(familyLinks(members, "h")).toEqual([link("h", "s"), link("w", "s"), link("h", "d"), link("w", "d")]);
    // Without Soț / Soție: the head only (never "all adults", never an inferred spouse).
    expect(familyLinks([m("h", "Cap de familie", { dataCasatoriei: "2010-01-01" }), m("w", ""), m("s", "Fiu")], "h")).toEqual([link("h", "s")]);
    // Two spouses (to check on De verificat): only the head is linked.
    expect(familyLinks([m("h", "Cap de familie"), m("a", "Soție"), m("b", "Soție"), m("s", "Fiu")], "h")).toEqual([link("h", "s")]);
  });
});

describe("the Ciobanu case (KINSHIP-FIX-SIBLINGS)", () => {
  // Dumitru heads the family, Iulia has no relation, Felix is an adult Fiu, Thea a minor Fiică.
  const m = (id: string, rudenie: string, dataNasterii: string) => ({ id, rudenie, dataNasterii });
  const dumitru = m("Dumitru", "Cap de familie", "1965-01-01");
  const iulia = m("Iulia", "", "1968-01-01");
  const felix = m("Felix", "Fiu", "1990-01-01");
  const thea = m("Thea", "Fiică", "2012-01-01");
  const born = (id: string) => [dumitru, iulia, felix, thea].find((x) => x.id === id)?.dataNasterii ?? null;

  it("Thea's parents: Dumitru only (and Iulia once she is Soție), never Felix — even when Felix is the family's head", () => {
    expect(familyLinks([dumitru, iulia, felix, thea], "Dumitru")).toEqual([link("Dumitru", "Felix"), link("Dumitru", "Thea")]);
    // The app may have chosen the adult son as the head (Membru first): he stays a son.
    expect(familyLinks([dumitru, iulia, felix, thea], "Felix")).toEqual([link("Dumitru", "Felix"), link("Dumitru", "Thea")]);
    const wife = { ...iulia, rudenie: "Soție" };
    expect(familyLinks([dumitru, wife, felix, thea], "Dumitru").filter((l) => l.childId === "Thea")).toEqual([link("Dumitru", "Thea"), link("Iulia", "Thea")]);
  });

  it("Felix and Thea are siblings, not parent and child", () => {
    const links = familyLinks([dumitru, iulia, felix, thea], "Dumitru");
    const g = kinGraph([p("Dumitru"), p("Iulia"), p("Felix"), p("Thea")], links, []);
    expect(relatives(g, "Felix").frati).toEqual(["Thea"]);
    expect(relatives(g, "Felix").copii).toEqual([]);
    expect(parentLinkError(links, "Felix", "Thea", born)).toBe(SIBLINGS_ERROR);
  });

  it("a parent at least 12 years older, when both birth dates are known", () => {
    expect(parentLinkError([], "Felix", "Thea", born)).toBeNull(); // 22 years
    expect(parentLinkError([], "Iulia", "Dumitru", born)).toBe(AGE_GAP_ERROR); // younger
    expect(parentLinkError([], "Felix", "Thea", (id) => (id === "Felix" ? "2005-01-01" : born(id)))).toBe(AGE_GAP_ERROR); // 7 years
    expect(parentLinkError([], "Felix", "Thea", (id) => (id === "Felix" ? null : born(id)))).toBeNull(); // unknown: allowed
  });

  it("the review finds the wrong stored links: siblings, too young, a son as parent in the common family", () => {
    const persons = new Map(
      [dumitru, iulia, felix, thea].map((x) => [x.id, { ...x, familyId: "fD" }] as const),
    );
    const stored = [
      { ...link("Dumitru", "Felix"), id: "1" },
      { ...link("Felix", "Thea"), id: "2" },
    ];
    expect(linkViolations(stored, persons, new Map([["fD", "Felix"]])).map((v) => [v.link.id, v.reason])).toEqual([["2", SAME_FAMILY_ERROR]]);
    const withThea = [...stored, { ...link("Dumitru", "Thea"), id: "3" }];
    expect(linkViolations(withThea, persons, new Map([["fD", "Dumitru"]])).map((v) => [v.link.id, v.reason])).toEqual([["2", SIBLINGS_ERROR]]);
  });
});

describe("neamuri", () => {
  it("one neam of 3 generations and 4 families, named after the ancestor with the most descendants", () => {
    const list = neamuri(g);
    expect(list).toHaveLength(1);
    const [n] = list;
    expect(n.name).toBe("Neamul Ciobanu Dumitru");
    expect(n.id).toBe("Dumitru");
    expect([n.persons, n.membri, n.families, n.generations]).toEqual([9, 7, 4, 3]);
  });

  it("a couple without children is no neam; the tree places everyone once", () => {
    const solo = kinGraph([...persons, p("X"), p("Y")], links, [...couples, ["X", "Y"]]);
    expect(neamuri(solo)).toHaveLength(1);
    const [n] = neamuri(solo);
    const trees = neamTree(solo, n);
    const ids: string[] = [];
    const walk = (t: { id: string; spouses: string[]; children: typeof trees }) => (ids.push(t.id, ...t.spouses), t.children.forEach(walk));
    trees.forEach(walk);
    expect(ids.sort()).toEqual([...n.members].sort());
    expect(trees[0].id).toBe("Dumitru");
    expect(trees[0].spouses).toEqual(["Elena"]);
    expect(trees[0].children.map((c) => c.id).sort()).toEqual(["Felix", "Maria"]);
  });
});
