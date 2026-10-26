import { describe, expect, it } from "vitest";
import { whatsappUrl, answersForFamily, parsePrayerKey, restrictivePrayer, prayerLabel, prayerMessage, prayerMessageError, prayerRotation, weekStartOf, type PrayerMember, type PrayerUnit } from "./prayer";

const TODAY = "2026-10-28";
const m = (id: string, prenume: string, over: Partial<PrayerMember> = {}): PrayerMember => ({
  id,
  nume: "Popescu",
  prenume,
  statut: "MEMBRU",
  dataNasterii: "1980-01-01",
  dataIesire: null,
  rudenie: "",
  ...over,
});
const unit = (key: string, members: PrayerMember[], over: Partial<PrayerUnit> = {}): PrayerUnit => ({
  key,
  headId: members[0]?.id ?? null,
  members,
  optOut: false,
  includeChildren: false,
  lastWeek: null,
  ...over,
});

const popescu = unit("f:pop", [
  m("ion", "Ion", { rudenie: "Cap de familie" }),
  m("maria", "Maria", { rudenie: "Soție" }),
  m("ana", "Ana", { rudenie: "Fiică", dataNasterii: "2015-05-05", statut: "APARTINATOR" }),
  m("matei", "Matei", { rudenie: "Fiu", dataNasterii: "2018-02-02", statut: "APARTINATOR" }),
]);

describe("weekly prayer", () => {
  it("shows only the surname and the parents' first names; the children only with the parents' consent", () => {
    expect(prayerLabel(popescu, TODAY)).toBe("Familia Popescu: Ion și Maria");
    expect(prayerLabel({ ...popescu, includeChildren: true }, TODAY)).toBe("Familia Popescu: Ion și Maria, cu copiii Ana și Matei");
    const label = prayerLabel({ ...popescu, includeChildren: true }, TODAY);
    expect(label).not.toMatch(/\d|@|\+/); // no ages, dates or contact data
  });

  it("leaves out former members, exits (deaths included) and anonymised persons", () => {
    const u = unit("f:x", [m("a", "Ion", { rudenie: "Cap de familie", dataIesire: "2025-01-01" }), m("b", "Maria", { rudenie: "Soție" }), m("c", "Vasile", { statut: "FOST_MEMBRU" })]);
    expect(prayerLabel(u, TODAY)).toBe("Familia Popescu: Maria");
  });

  it("puts in the rotation only units with an active adult and no objection", () => {
    const minorsOnly = unit("f:minors", [m("k", "Ana", { dataNasterii: "2016-01-01" })]);
    const gone = unit("f:gone", [m("g", "Ion", { statut: "FOST_MEMBRU" })]);
    const objected = unit("f:no", [m("n", "Ion", { nume: "Ionescu" })], { optOut: true });
    const single = unit("p:solo", [m("s", "Elena", { nume: "Albu" })], { headId: null });
    expect(prayerRotation([popescu, minorsOnly, gone, objected, single], TODAY).map((r) => r.key)).toEqual(["p:solo", "f:pop"]);
  });

  it("orders never announced first, then the oldest announcement, then alphabetically", () => {
    const a = unit("f:a", [m("a", "A", { nume: "Zamfir" })], { lastWeek: "2026-09-07" });
    const b = unit("f:b", [m("b", "B", { nume: "Barbu" })], { lastWeek: "2026-10-05" });
    const c = unit("f:c", [m("c", "C", { nume: "Ciobanu" })]);
    const d = unit("f:d", [m("d", "D", { nume: "Ștefan" })]);
    expect(prayerRotation([a, b, d, c], TODAY).map((r) => r.key)).toEqual(["f:c", "f:d", "f:a", "f:b"]);
  });

  it("weeks start on Monday", () => {
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26");
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26");
    expect(weekStartOf("2026-10-28")).toBe("2026-10-26");
  });

  it("fills the message; {familia} is the only variable", () => {
    expect(prayerMessage("", "Familia Popescu: Ion și Maria")).toBe("Săptămâna aceasta ne rugăm pentru Familia Popescu: Ion și Maria. Să-i purtăm în rugăciune!");
    expect(prayerMessage("Ne rugăm pentru {familia}.", "X")).toBe("Ne rugăm pentru X.");
    expect(prayerMessageError("")).toBeNull();
    expect(prayerMessageError("Fără variabilă")).toContain("{familia}");
    expect(prayerMessageError("{familia} la {telefon}")).toContain("Singura variabilă");
    expect(prayerMessageError("x".repeat(501) + "{familia}")).toContain("500");
  });

  it("reads only well-formed unit keys", () => {
    expect(parsePrayerKey("f:abc")).toEqual({ familyId: "abc" });
    expect(parsePrayerKey("p:abc")).toEqual({ personId: "abc" });
    expect(parsePrayerKey("x:abc")).toBeNull();
    expect(parsePrayerKey("f:a b")).toBeNull();
  });

  it("the head, a spouse or an adult without a family answers for the family in the campaign", () => {
    const base = { id: "a", familyId: "f", rudenie: "", family: { headId: "h" } };
    expect(answersForFamily({ ...base, family: { headId: "a" } })).toBe(true);
    expect(answersForFamily({ ...base, rudenie: "Soție" })).toBe(true);
    expect(answersForFamily({ ...base, familyId: null, family: null })).toBe(true);
    expect(answersForFamily({ ...base, rudenie: "Fiu" })).toBe(false);
  });

  it("two parents answering differently: the more restrictive answer wins", () => {
    expect(restrictivePrayer([{ optOut: false, includeChildren: true }, { optOut: true, includeChildren: false }])).toEqual({ optOut: true, includeChildren: false });
    expect(restrictivePrayer([{ includeChildren: true }, { includeChildren: true }])).toEqual({ includeChildren: true });
    expect(restrictivePrayer([{ optOut: false }, {}])).toEqual({ optOut: false });
  });

  it("the WhatsApp link carries the edited text encoded: diacritics, new lines, emoji, no phone number", () => {
    const text = "Săptămâna aceasta ne rugăm pentru Familia Țurcanu: Ștefan și Ioana.\nPsalmul 23 🙏 & \"pace\"";
    const url = whatsappUrl(text);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).not.toMatch(/[\s"&]$|wa\.me\/\d/);
    expect(url).toContain("%0A"); // the new line
    expect(url).toContain("%F0%9F%99%8F"); // the emoji
    expect(url).toContain("%C8%9A"); // Ț
    expect(decodeURIComponent(url.slice("https://wa.me/?text=".length))).toBe(text);
  });
});

