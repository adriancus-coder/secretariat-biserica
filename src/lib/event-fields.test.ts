import { describe, expect, it } from "vitest";
import { NOMEN_DEFAULTS } from "./labels";
import { ALL_EVENT_FIELDS, eventFieldsFor, eventPlace, EVENT_TYPE_FIELDS, visibleEventFields } from "./event-fields";
import { roleKey } from "./roles";

describe("EVENT-FIELDS-BY-TYPE", () => {
  it("the configuration has a row for every type of the default nomenclature", () => {
    const keys = Object.keys(EVENT_TYPE_FIELDS).map(roleKey);
    for (const t of NOMEN_DEFAULTS.tipuriEvenimente) expect(keys, t).toContain(roleKey(t));
  });

  it("each type shows its fields; an unknown type shows them all", () => {
    expect([...eventFieldsFor("Binecuvântare copil")]).toEqual(["persoane", "ora", "oficiant", "descriere"]);
    expect(eventFieldsFor("binecuvantare copil")).toEqual(eventFieldsFor("Binecuvântare copil"));
    expect(eventFieldsFor("Evanghelizare")).toContain("invitat");
    expect(eventFieldsFor("Evanghelizare")).toContain("responsabil");
    expect(eventFieldsFor("Nuntă")).toContain("agapa");
    expect([...eventFieldsFor("Cina Domnului")]).toEqual(["ora", "oficiant"]);
    expect([...eventFieldsFor("Agapă")]).toEqual(["ora", "responsabil", "agapa"]);
    expect(eventFieldsFor("Seară de tineret nouă")).toEqual(ALL_EVENT_FIELDS);
  });

  it("an older blessing with „Invitat” keeps it visible; an empty one does not", () => {
    expect(visibleEventFields("Binecuvântare copil", { invitat: "Pastor Ionescu" }).has("invitat")).toBe(true);
    expect(visibleEventFields("Binecuvântare copil", { invitat: "" }).has("invitat")).toBe(false);
    expect(visibleEventFields("Cina Domnului", { contributii: 2 }).has("agapa")).toBe(true);
    expect(visibleEventFields("Cina Domnului", { familyId: "f1" }).has("persoane")).toBe(true);
  });

  it("an empty place reads „la biserică”, with the address where given", () => {
    expect(eventPlace("")).toBe("la biserică");
    expect(eventPlace("  ", "Kongsgårdbakken 1, 4005 Stavanger")).toBe("la biserică, Kongsgårdbakken 1, 4005 Stavanger");
    expect(eventPlace("Sala sporturilor", "x")).toBe("Sala sporturilor");
  });
});
