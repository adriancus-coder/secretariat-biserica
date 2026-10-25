import { describe, expect, it } from "vitest";
import { addMemberBaptism, importedBaptism, parseMemberBaptism } from "./baptism-backup";

describe("baptism backup", () => {
  it("round-trips the three fields", () => {
    const members: Record<string, Record<string, unknown>> = { a: { id: "a", locBotez: "Oslo" }, b: { id: "b" } };
    addMemberBaptism(members, new Map([["a", { botezBiserica: "Betel", botezLocalitate: "Oslo", botezOficiant: "Ioan Pop" }]]));
    const parsed = parseMemberBaptism({ members });
    expect(parsed.get("a")).toEqual({ botezBiserica: "Betel", botezLocalitate: "Oslo", botezOficiant: "Ioan Pop" });
    expect(parsed.has("b")).toBe(false);
  });
  it("maps an older file's locBotez to the locality", () => {
    const parsed = parseMemberBaptism({ members: [{ id: "x", locBotez: "Biserica Emanuel Oradea" }] });
    expect(importedBaptism(parsed.get("x"), "Biserica Emanuel Oradea")).toEqual({
      botezBiserica: "",
      botezLocalitate: "Biserica Emanuel Oradea",
      botezOficiant: "",
    });
  });
});
