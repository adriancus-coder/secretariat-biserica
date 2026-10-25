import { describe, expect, it } from "vitest";
import { addMeetingAttendance, parseMeetingAttendance } from "./attendance-backup";

describe("meeting attendance extras in the backup", () => {
  it("round-trips the absentees and the expected count", () => {
    const meetings: Record<string, Record<string, unknown>> = { m1: { tip: "Comitet", prezenti: ["a"] }, m2: { tip: "Altele" } };
    addMeetingAttendance(meetings, new Map([["m1", { absenti: ["b", "c"], asteptati: 3 }], ["m2", { absenti: [], asteptati: null }]]));
    expect(meetings.m1).toMatchObject({ absenti: ["b", "c"], asteptati: 3 });
    expect("absenti" in meetings.m2 || "asteptati" in meetings.m2).toBe(false);
    expect(parseMeetingAttendance({ meetings })).toEqual(new Map([["m1", { absenti: ["b", "c"], asteptati: 3 }]]));
  });

  it("ignores older files and malformed values", () => {
    expect(parseMeetingAttendance({ meetings: { m1: { prezenti: ["a"] } } }).size).toBe(0);
    expect(parseMeetingAttendance({}).size).toBe(0);
    expect(parseMeetingAttendance({ meetings: [{ id: "m1", absenti: ["ok", "nu e bun", 3, "ok"], asteptati: -1 }] })).toEqual(
      new Map([["m1", { absenti: ["ok"], asteptati: null }]]),
    );
  });
});
