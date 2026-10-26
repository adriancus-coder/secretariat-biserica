import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { externalKey } from "./kinship-parents";
import { ALREADY_SIBLINGS, DIFFERENT_PARENTS, NAMES_DIFFER, siblingPlan, type SiblingSide } from "./kinship-siblings";

const side = (id: string, over: Partial<SiblingSide> = {}): SiblingSide => ({ id, name: `Ciobanu ${id}`, gen: "M", numeTata: "", numeMama: "", parents: [], ...over });
const names: Record<string, string> = { dumitru: "Ciobanu Dumitru", elena: "Ciobanu Elena" };
const nameOf = (k: string) => names[k] ?? k;

describe("+ Adaugă frate / soră (KINSHIP-CARD-SIBLINGS)", () => {
  it("a) a parent in common (in the register or outside it) → „Sunt deja frați.”", () => {
    expect(siblingPlan(side("Ion", { parents: ["dumitru"] }), side("Dan", { parents: ["dumitru", "elena"] }), nameOf, [])).toEqual({ kind: "already", message: ALREADY_SIBLINGS });
    const x = externalKey("p");
    expect(siblingPlan(side("Ion", { parents: [x] }), side("Dan", { parents: [x] }), nameOf, []).kind).toBe("already");
  });

  it("b) one has parents in the register, the other none → link the other to the same parents", () => {
    const plan = siblingPlan(side("Ion", { parents: ["dumitru", "elena"] }), side("Ana", { gen: "F" }), nameOf, []);
    expect(plan).toEqual({ kind: "adopt", childId: "Ana", parents: ["dumitru", "elena"], text: "Leagă pe Ciobanu Ana ca fiică a lui Ciobanu Dumitru și Ciobanu Elena?" });
    // Both with parents, none in common: refused.
    expect(siblingPlan(side("Ion", { parents: ["dumitru"] }), side("Dan", { parents: ["elena"] }), nameOf, [])).toEqual({ kind: "refuse", message: DIFFERENT_PARENTS });
  });

  it("c) no parent in the register, names on one file → reused for both, written where missing", () => {
    const plan = siblingPlan(side("Ion", { numeTata: "Ciobanu Petru", numeMama: "Ciobanu Ana" }), side("Dan", { numeTata: "petru  CIOBANU" }), nameOf, []);
    expect(plan).toMatchObject({ kind: "names", tata: "Ciobanu Petru", mama: "Ciobanu Ana", fills: [{ personId: "Dan", field: "numeMama", value: "Ciobanu Ana" }], reuse: {} });
    expect(plan.kind === "names" && plan.text).toBe(
      "Ciobanu Ion și Ciobanu Dan devin frați, copii ai lui Ciobanu Petru și Ciobanu Ana (în afara registrului). Se completează pe fișa lui Ciobanu Dan: Numele mamei „Ciobanu Ana”.",
    );
  });

  it("c) different names on the two files → refused", () => {
    expect(siblingPlan(side("Ion", { numeTata: "Ciobanu Petru" }), side("Dan", { numeTata: "Ciobanu Pavel" }), nameOf, [])).toEqual({ kind: "refuse", message: NAMES_DIFFER });
  });

  it("c) no names anywhere → ask once; the typed names go on both files", () => {
    const a = side("Ion");
    const b = side("Dan");
    expect(siblingPlan(a, b, nameOf, []).kind).toBe("ask");
    expect(siblingPlan(a, b, nameOf, [], { tata: " ", mama: "" }).kind).toBe("ask");
    const plan = siblingPlan(a, b, nameOf, [], { tata: "Ciobanu Petru", mama: "" });
    expect(plan).toMatchObject({
      kind: "names",
      tata: "Ciobanu Petru",
      mama: "",
      fills: [
        { personId: "Ion", field: "numeTata", value: "Ciobanu Petru" },
        { personId: "Dan", field: "numeTata", value: "Ciobanu Petru" },
      ],
    });
    expect(plan.kind === "names" && plan.text).toContain("Se completează pe fișele lui Ciobanu Ion și Ciobanu Dan: Numele tatălui „Ciobanu Petru”.");
  });

  it("a third brother of the same parent outside the register reuses it", () => {
    const petru = { key: externalKey("petru"), nume: "Ciobanu Petru", gen: "M" as const };
    const plan = siblingPlan(side("Ion", { numeTata: "Ciobanu Petru", parents: [petru.key] }), side("Vasile", { numeTata: "Petru Ciobanu" }), nameOf, [petru]);
    expect(plan).toMatchObject({ kind: "names", reuse: { tata: petru.key }, fills: [] });
    // A father outside the register with another name than the one written: refused.
    expect(siblingPlan(side("Ion", { parents: [petru.key] }), side("Vasile", { numeTata: "Ciobanu Pavel" }), nameOf, [petru])).toEqual({ kind: "refuse", message: NAMES_DIFFER });
  });

  it("the person page no longer adds children (they come from the family)", () => {
    const card = readFileSync("src/app/(app)/persoane/[id]/kinship-card.tsx", "utf8");
    expect(card).not.toContain("Adaugă copil");
    expect(card).toContain("+ Adaugă frate / soră");
    expect(card).toContain("Copiii se adaugă din familie, cu „+ Membru de familie”.");
  });
});
