import { describe, expect, it } from "vitest";
import { drafterKeys, missingLine, paperNote, roleSigners, signatureState, signsAtBottom, tableSigners } from "./minutes-signatures";

const church = { secretar: "Adrian Emanuel Cusniriuc", pastor: "Dumitru Ciobanu" };
const p = (prenume: string, nume: string) => ({ prenume, nume });

describe("MINUTES-SIGNATURES", () => {
  it("the Secretar and the Pastor of „Întocmit” are left out of the table, in any word order and without diacritics", () => {
    const present = [p("Dumitru", "Ciobanu"), p("Adrian Emanuel", "Cușniriuc"), p("Ana", "Pop"), p("Ion", "Rusu"), p("Maria", "Ciobanu")];
    expect(tableSigners(present, church).map((x) => x.prenume)).toEqual(["Ana", "Ion", "Maria"]);
  });

  it("titles and several pastors in Setări are understood", () => {
    const keys = drafterKeys({ secretar: "Fratele Ion Rusu", pastor: "Pastor Dumitru Ciobanu, Vasile Pop" });
    expect(signsAtBottom(p("Ion", "Rusu"), keys)).toBe(true);
    expect(signsAtBottom(p("Dumitru", "Ciobanu"), keys)).toBe(true);
    expect(signsAtBottom(p("Vasile", "Pop"), keys)).toBe(true);
    expect(signsAtBottom(p("Ana", "Pop"), keys)).toBe(false);
  });

  it("an empty place in Setări has nobody to sign it; the lines name what is missing", () => {
    expect(roleSigners({ secretar: "", pastor: "Dumitru Ciobanu" })).toEqual([{ rol: "PASTOR", label: "Pastor", name: "Dumitru Ciobanu" }]);
    expect(missingLine(["Pop Ana", "Pastor Dumitru Ciobanu"])).toBe("Lipsesc: Pop Ana, Pastor Dumitru Ciobanu.");
    expect(paperNote(["Pop Ana"])).toBe("Semnat pe hârtie de: Pop Ana.");
    expect(signatureState(null)).toBe("nesemnat");
    expect(signatureState({ paper: true, at: "30.10.2026 18:00", by: "Ana Pop" })).toBe("semnat pe hârtie 30.10.2026 18:00 · marcat de Ana Pop");
    expect(signatureState({ paper: false, at: "30.10.2026 18:00" })).toBe("semnat 30.10.2026 18:00");
  });
});
