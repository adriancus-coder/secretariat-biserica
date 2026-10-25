import { describe, expect, it } from "vitest";
import { addMemberBaptism, importedBaptism, parseMemberBaptism } from "./baptism-backup";

describe("baptism backup", () => {
  it("round-trips the three fields", () => {
    const members: Record<string, Record<string, unknown>> = { a: { id: "a", locBotez: "Oslo" }, b: { id: "b" } };
    addMemberBaptism(members, new Map([["a", { botezBiserica: "Betel", botezLocalitate: "Oslo", botezOficiant: "Ioan Pop", botezAn: null }]]));
    expect("botezAn" in members.a).toBe(false);
    const parsed = parseMemberBaptism({ members });
    expect(parsed.get("a")).toEqual({ botezBiserica: "Betel", botezLocalitate: "Oslo", botezOficiant: "Ioan Pop", botezAn: null });
    expect(parsed.has("b")).toBe(false);
  });
  it("round-trips a baptism known only by its year", () => {
    const members: Record<string, Record<string, unknown>> = { a: { id: "a", dataBotez: "" } };
    addMemberBaptism(members, new Map([["a", { botezBiserica: "", botezLocalitate: "", botezOficiant: "", botezAn: 2010 }]]));
    expect(members.a.botezAn).toBe(2010);
    const parsed = parseMemberBaptism({ members });
    expect(importedBaptism(parsed.get("a"), "", null).botezAn).toBe(2010);
    // A full date wins over the year.
    expect(importedBaptism(parsed.get("a"), "", "2011-05-01").botezAn).toBe(2011);
  });
  it("maps an older file's locBotez to the locality and takes the year from the date", () => {
    const parsed = parseMemberBaptism({ members: [{ id: "x", locBotez: "Biserica Emanuel Oradea" }] });
    expect(importedBaptism(parsed.get("x"), "Biserica Emanuel Oradea", "2008-06-15")).toEqual({
      botezBiserica: "",
      botezLocalitate: "Biserica Emanuel Oradea",
      botezOficiant: "",
      botezAn: 2008,
    });
    expect(importedBaptism(undefined, "", null).botezAn).toBeNull();
  });
});
