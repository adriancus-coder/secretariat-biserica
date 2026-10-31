import { describe, expect, it } from "vitest";
import { expectNoLeak, findLeaks, stripIds } from "../helpers/no-leak";

describe("TEST-FLAKY-IDS: expectNoLeak", () => {
  it("an id that happens to contain „900” or „2016” does not fail", () => {
    const page = { next: { key: "f:cmvvljlf900089i0ds410rqfn", label: "Familia Popescu: Ion și Maria" }, ids: ["cm2016abcdefghijklmnopqrs"], personId: "cx900yz00000000000000000a" };
    expectNoLeak(page, ["900", "2016", "+47 900 11 222", "Ana"]);
    expect(stripIds(page)).toEqual({ next: { key: "<id>", label: "Familia Popescu: Ion și Maria" }, ids: "<id>", personId: "<id>" });
  });

  it("the full phone number, the e-mail, the birth date and a whole name fail", () => {
    const leaked = { label: "Familia Popescu", telefon: "+47 900 11 222", email: "Ana@x.no", born: new Date("2016-01-01T00:00:00Z"), note: "cu Ana" };
    expect(findLeaks(leaked, ["+47 900 11 222", "Ana@x.no", "2016-01-01", "Ana"])).toEqual(["+47 900 11 222", "Ana@x.no", "2016-01-01", "Ana"]);
    expect(() => expectNoLeak(leaked, ["+47 900 11 222"])).toThrow();
  });

  it("a name is matched as a whole word only", () => {
    expectNoLeak({ label: "Familia Ioana și Anastasia", ok: "Banat" }, ["Ana"]);
    expect(findLeaks({ label: "copilul Ana." }, ["Ana"])).toEqual(["Ana"]);
    expect(findLeaks({ year: "născută în 2016" }, ["2016"])).toEqual(["2016"]);
    expect(findLeaks({ year: "20161" }, ["2016"])).toEqual([]);
  });
});
