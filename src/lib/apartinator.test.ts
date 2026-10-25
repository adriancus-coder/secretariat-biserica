import { describe, expect, it } from "vitest";
import { apartinatorKind } from "./apartinator";

const today = "2026-11-01";
const parent = { id: "t", statut: "MEMBRU" as const, rudenie: "Cap de familie", dataIesire: null };

describe("apartinatorKind (Statut art. 28)", () => {
  it("a) unbaptised minor in a family with a member parent", () => {
    expect(apartinatorKind({ statut: "APARTINATOR", dataNasterii: "2015-01-01", baptised: false }, [parent], "t", today)).toBe("a");
  });
  it("b) an adult, a family without a member parent, or a member who left", () => {
    expect(apartinatorKind({ statut: "APARTINATOR", dataNasterii: "1990-01-01", baptised: false }, [parent], "t", today)).toBe("b");
    expect(apartinatorKind({ statut: "APARTINATOR", dataNasterii: "2015-01-01", baptised: false }, [{ ...parent, statut: "PRIETEN" }], "t", today)).toBe("b");
    expect(apartinatorKind({ statut: "APARTINATOR", dataNasterii: "2015-01-01", baptised: false }, [{ ...parent, dataIesire: new Date() }], "t", today)).toBe("b");
  });
  it("the head counts even without a rudenie; other statuses have no kind", () => {
    expect(apartinatorKind({ statut: "APARTINATOR", dataNasterii: "2015-01-01", baptised: false }, [{ ...parent, rudenie: "" }], "t", today)).toBe("a");
    expect(apartinatorKind({ statut: "MEMBRU", dataNasterii: "2015-01-01", baptised: true }, [parent], "t", today)).toBeNull();
  });
});
