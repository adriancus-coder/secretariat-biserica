import { describe, expect, it } from "vitest";
import type { PrayerMember, PrayerUnit } from "./prayer";
import { DEFAULT_FAMILY_MESSAGE, DEFAULT_PERSON_MESSAGE, OLD_DEFAULT_MESSAGE, prayerMessageFor, templateError } from "./prayer-message";

const TODAY = "2026-10-28";
const T = { family: "", person: "" };
let n = 0;
const m = (nume: string, prenume: string, over: Partial<PrayerMember> = {}): PrayerMember => ({
  id: `m${++n}`,
  nume,
  prenume,
  statut: "MEMBRU",
  dataNasterii: "1985-01-01",
  dataIesire: null,
  rudenie: "",
  gen: null,
  ...over,
});
const family = (members: PrayerMember[], includeChildren = false): PrayerUnit => ({ key: "f:x", headId: members[0].id, members, optOut: false, includeChildren, lastWeek: null });
const head = (nume: string, prenume: string, gen = "M") => m(nume, prenume, { rudenie: "Cap de familie", gen });
const wife = (nume: string, prenume: string) => m(nume, prenume, { rudenie: "Soție", gen: "F" });
const kid = (prenume: string, gen: string | null, born: string | null) => m("Marin", prenume, { rudenie: gen === "F" ? "Fiică" : "Fiu", gen, dataNasterii: born, statut: "APARTINATOR" });
const msg = (u: PrayerUnit, t = T) => prayerMessageFor(u, TODAY, t);
/** The family part of the default message: between "familia " and ", ca Domnul". */
const part = (text: string) => text.slice(text.indexOf("familia ") + "familia ".length, text.indexOf(", ca Domnul"));

describe("the week's message, in the church's own words", () => {
  it("reproduces the church's example: different surnames, a little boy, with consent", () => {
    const u = family([head("Marin", "Vicențiu"), wife("Marcu", "Rebeca"), kid("Samuel", "M", "2023-05-01")], true);
    expect(msg(u)).toBe(
      "Pace, frați și surori! Săptămâna aceasta ne vom ruga pentru familia Marin Vicențiu și Marcu Rebeca și pentru micuțul Samuel, ca Domnul să-i binecuvânteze cu sănătate și cu dragoste de Domnul și să le dea înțelepciune în toate. Amin.",
    );
  });

  it("the same surname is written once", () => {
    expect(part(msg(family([head("Popescu", "Ion"), wife("Popescu", "Maria")])))).toBe("Popescu Ion și Maria");
  });

  it("a girl of 15 with consent: „fiica lor, Maria”", () => {
    expect(part(msg(family([head("Marin", "Vicențiu"), wife("Marin", "Rebeca"), kid("Maria", "F", "2011-03-01")], true)))).toBe("Marin Vicențiu și Rebeca și pentru fiica lor, Maria");
  });

  it("three children with consent: „copiii lor, Andrei, Ana și Samuel”", () => {
    const u = family([head("Marin", "Vicențiu"), wife("Marin", "Rebeca"), kid("Andrei", "M", "2012-01-01"), kid("Ana", "F", "2016-01-01"), kid("Samuel", "M", "2023-01-01")], true);
    expect(part(msg(u))).toBe("Marin Vicențiu și Rebeca și pentru copiii lor, Andrei, Ana și Samuel");
  });

  it("without consent no child's name: one child, three children", () => {
    const one = msg(family([head("Marin", "Vicențiu"), wife("Marin", "Rebeca"), kid("Samuel", "M", "2023-05-01")]));
    expect(one).toContain("familia Marin Vicențiu și Rebeca și pentru copilul lor, ca Domnul");
    expect(one).not.toContain("Samuel");
    const three = msg(family([head("Marin", "Vicențiu"), wife("Marin", "Rebeca"), kid("Andrei", "M", "2012-01-01"), kid("Ana", "F", "2016-01-01"), kid("Samuel", "M", "2023-01-01")]));
    expect(part(three)).toBe("Marin Vicențiu și Rebeca și pentru copiii lor");
    expect(three).not.toMatch(/Andrei|Ana|Samuel/);
  });

  it("a single mother: „micuța Ana” with consent, „copilul ei” without", () => {
    const mother = m("Pop", "Elena", { rudenie: "Cap de familie", gen: "F" });
    const ana = kid("Ana", "F", "2021-01-01");
    expect(part(msg(family([mother, ana], true)))).toBe("Pop Elena și pentru micuța Ana");
    expect(part(msg(family([mother, ana])))).toBe("Pop Elena și pentru copilul ei");
    expect(part(msg(family([mother, ana, kid("Ioan", "M", "2019-01-01")])))).toBe("Pop Elena și pentru copiii ei");
  });

  it("no gender or no birth date: „copilul lor, X”; adult children are left out", () => {
    expect(part(msg(family([head("Marin", "Vicențiu"), wife("Marin", "Rebeca"), kid("Iosif", null, "2018-01-01")], true)))).toBe("Marin Vicențiu și Rebeca și pentru copilul lor, Iosif");
    expect(part(msg(family([head("Marin", "Vicențiu"), wife("Marin", "Rebeca"), kid("Iosif", "M", null)], true)))).toBe("Marin Vicențiu și Rebeca și pentru copilul lor, Iosif");
    expect(part(msg(family([head("Marin", "Vicențiu"), wife("Marin", "Rebeca"), kid("Daniel", "M", "2000-01-01")], true)))).toBe("Marin Vicențiu și Rebeca");
  });

  it("a family without children: nothing after the parents", () => {
    expect(msg(family([head("Popescu", "Ion"), wife("Popescu", "Maria")]))).toContain("familia Popescu Ion și Maria, ca Domnul");
  });

  it("a person without a family: brother, sister, no gender", () => {
    const person = (gen: string | null) => ({ ...family([m("Pop", "Ana", { gen })]), key: "p:x", headId: null });
    expect(msg(person("F"))).toBe("Pace, frați și surori! Săptămâna aceasta ne vom ruga pentru sora Pop Ana, ca Domnul s-o binecuvânteze cu sănătate și cu dragoste de Domnul și să-i dea înțelepciune în toate. Amin.");
    expect(msg(person("M"))).toContain("pentru fratele Pop Ana, ca Domnul să-l binecuvânteze cu sănătate și cu dragoste de Domnul și să-i dea");
    expect(msg(person(null))).toContain("pentru fratele/sora Pop Ana, ca Domnul să-l/s-o binecuvânteze");
  });

  it("an older template with {familia} keeps working", () => {
    const u = family([head("Popescu", "Ion"), wife("Popescu", "Maria")]);
    expect(msg(u, { family: OLD_DEFAULT_MESSAGE, person: "" })).toBe("Săptămâna aceasta ne rugăm pentru Familia Popescu: Ion și Maria. Să-i purtăm în rugăciune!");
  });

  it("never a double space, „ ,”, an age, a date or a digit", () => {
    const u = family([head("Marin", "Vicențiu"), wife("Marcu", "Rebeca"), kid("Samuel", "M", "2023-05-01")], true);
    const text = msg(u, { family: "Ne rugăm  pentru {parinti} {copii} , amin.", person: "" });
    expect(text).toBe("Ne rugăm pentru Marin Vicențiu și Marcu Rebeca și pentru micuțul Samuel, amin.");
    expect(msg(u)).not.toMatch(/ {2}| ,|\d/);
  });

  it("checks the templates on the server: the needed variable, no unknown one", () => {
    expect(templateError(DEFAULT_FAMILY_MESSAGE, "family")).toBeNull();
    expect(templateError(DEFAULT_PERSON_MESSAGE, "person")).toBeNull();
    expect(templateError(OLD_DEFAULT_MESSAGE, "family")).toBeNull();
    expect(templateError("Ne rugăm pentru ei.", "family")).toContain("{parinti}");
    expect(templateError("Ne rugăm pentru {parinti}.", "person")).toContain("nu este permisă");
    expect(templateError("Ne rugăm pentru frate.", "person")).toContain("{persoana}");
    expect(templateError("", "family")).toBeNull();
  });
});
