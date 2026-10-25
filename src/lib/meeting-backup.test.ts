import { describe, expect, it } from "vitest";
import { addMeetingExtras, parseMeetingExtras, type MeetingExtra } from "./meeting-backup";

describe("meeting extras in the backup", () => {
  it("round-trips absentees, expected count, number, points, observations and closing sentence", () => {
    const meetings: Record<string, Record<string, unknown>> = { m1: { tip: "Comitet", prezenti: ["a"] }, m2: { tip: "Altele" } };
    const extra = { absenti: ["b", "c"], asteptati: 3, nr: 16, puncte: ["Unu", "Doi"], observatii: "Obs", formulaIncheiere: "Gata." };
    addMeetingExtras(meetings, new Map<string, MeetingExtra>([["m1", extra], ["m2", { absenti: [], asteptati: null }]]));
    expect(meetings.m1).toMatchObject(extra);
    expect(Object.keys(meetings.m2)).toEqual(["tip"]);
    expect(parseMeetingExtras({ meetings })).toEqual(new Map([["m1", extra]]));
  });

  it("round-trips the General Assembly fields and the votes", () => {
    const meetings: Record<string, Record<string, unknown>> = { m1: { tip: "Adunare generală" } };
    const extra: MeetingExtra = {
      absenti: [],
      asteptati: null,
      puncte: ["Unu", "Doi"],
      convocatLa: "2026-03-01",
      convocareText: "Alegerea comitetului",
      tipAG: "ORDINARA",
      convocataDeComunitate: true,
      voturi: [{ pentru: 20, contra: 3, abtineri: 1, secret: true }, null],
    };
    addMeetingExtras(meetings, new Map([["m1", extra]]));
    expect(parseMeetingExtras({ meetings })).toEqual(new Map([["m1", extra]]));
    const bad = parseMeetingExtras({ meetings: { m1: { convocatLa: "ieri", tipAG: "ALTA", voturi: [{ pentru: -1 }] } } });
    expect(bad.size).toBe(0);
  });

  it("ignores older files and malformed values", () => {
    expect(parseMeetingExtras({ meetings: { m1: { prezenti: ["a"], hotarari: "x" } } }).size).toBe(0);
    expect(parseMeetingExtras({}).size).toBe(0);
    expect(parseMeetingExtras({ meetings: [{ id: "m1", absenti: ["ok", "nu e bun", 3, "ok"], asteptati: -1, nr: 0, puncte: ["  A ", 5, ""] }] })).toEqual(
      new Map([["m1", { absenti: ["ok"], asteptati: null, puncte: ["A"] }]]),
    );
  });
});
