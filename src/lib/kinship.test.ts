import { describe, expect, it } from "vitest";
import { familyLinks, familyParents, kinGraph, neamTree, neamuri, parentLinkError, relativeName, relatives, type KinLink, type KinPerson } from "./kinship";

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

  it("family links: Fiu / Fiică / Copil become children of the head and the spouse", () => {
    const m = (id: string, rudenie: string, extra: object = {}) => ({ id, rudenie, dataNasterii: null, ...extra });
    const members = [m("h", "Cap de familie"), m("w", "Soție"), m("s", "Fiu"), m("d", "Fiică", { dataNasterii: "1990-01-01" }), m("g", "Nepot"), m("b", "Părinte")];
    expect(familyLinks(members, "h", TODAY)).toEqual([link("h", "s"), link("w", "s"), link("h", "d"), link("w", "d")]);
    // A wife without a relation, with a married head (PRAYER-FAMILY-ROLES): she is the other parent.
    const felix = [m("h", "Cap de familie", { dataCasatoriei: "2010-01-01" }), m("w", ""), m("s", "Fiu")];
    expect(familyParents(felix, "h", TODAY).map((x) => x.id)).toEqual(["h", "w"]);
    // Two spouses (to check on De verificat): only the head is linked.
    expect(familyLinks([m("h", "Cap de familie"), m("a", "Soție"), m("b", "Soție"), m("s", "Fiu")], "h", TODAY)).toEqual([link("h", "s")]);
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
