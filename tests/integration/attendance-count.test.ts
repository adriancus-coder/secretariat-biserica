import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, actionCtx: async () => current }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<object>()), redirect: () => {} }));

const { saveMeetingAction } = await import("@/server/actions/meetings");
const { committeeAbsences } = await import("@/server/queries/committee");
const { getChurch } = await import("@/server/queries/church");
const { getMeeting } = await import("@/server/queries/meetings");
const { meetingSpec } = await import("@/server/pdf/meeting");
const { printToText, } = await import("@/domain/print");
const { toPrototypeJson, parsePrototypeJson } = await import("@/domain/backup");
const { addMeetingExtras, parseMeetingExtras } = await import("@/lib/meeting-backup");
const { importBackup, loadBackup, loadMeetingExtras } = await import("@/server/backup");

/** ATTENDANCE-COUNT on the database: saving by number, the votes, art. 45, the backup. */
describe.skipIf(!hasTestDb)("attendance recorded as a number", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let churchId: string;
  const committee: string[] = [];
  const form = (fields: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ tip: "Comitet", formulaIncheiere: "Gata.", ...fields })) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    return f;
  };
  const meetingOn = async (date: string) => (await prisma.meeting.findFirstOrThrow({ where: { churchId, data: new Date(`${date}T00:00:00Z`) } })).id;

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Numar", slug: "numar" } })).id;
    const u = await prisma.user.create({ data: { churchId, email: "s@x.ro", name: "Secretar", passwordHash: "x", role: "SECRETAR" } });
    ctx = { user: { id: u.id, name: "Secretar", email: "s@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId, churchName: "N" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    current = ctx;
    for (const [i, n] of ["Ana", "Ion", "Dan"].entries()) {
      committee.push((await prisma.person.create({ data: { churchId, nume: "Pop", prenume: n, sortKey: `pop ${n}`, inComitet: true, statut: "MEMBRU", dataMembru: new Date(`200${i}-01-01T00:00:00Z`) } })).id);
    }
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("a committee meeting saved by name, then by number: the ticks go (audited), the PDF says „Prezenți: 2”", async () => {
    await saveMeetingAction(null, {}, form({ data: "2026-01-10", prezenti: [committee[0], committee[1]] }));
    const id = await meetingOn("2026-01-10");
    expect(await prisma.meetingAttendee.count({ where: { meetingId: id } })).toBe(3); // 2 present + Dan absent
    await saveMeetingAction(id, {}, form({ data: "2026-01-10", modPrezenta: "numar", numarPrezenti: "2", prezenti: [committee[0]] }));
    const m = await prisma.meeting.findUniqueOrThrow({ where: { id } });
    expect(m.numarPrezenti).toBe(2);
    expect(await prisma.meetingAttendee.count({ where: { meetingId: id } })).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(audit.changes)).toContain("prezența consemnată ca număr: 2");
    const text = printToText(meetingSpec((await getMeeting(ctx, id))!, await getChurch(ctx)));
    expect(text).toContain("Prezenți: 2");
    expect(text).not.toContain("Absenți");
    expect(text).not.toContain("Ana Pop");
    // Back by name: the number is cleared, the ticks and absentees come back.
    await saveMeetingAction(id, {}, form({ data: "2026-01-10", modPrezenta: "nume", numarPrezenti: "2", prezenti: [committee[0]] }));
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id } })).numarPrezenti).toBeNull();
    expect(await prisma.meetingAttendee.count({ where: { meetingId: id, status: "ABSENT" } })).toBe(2);
  });

  it("art. 45: committee meetings by number neither count as present nor as absent", async () => {
    // Dan absent at five meetings by name, with three meetings by number in between.
    const dates = ["2026-02-01", "2026-02-08", "2026-02-15", "2026-02-22", "2026-03-01"];
    for (const d of dates) await saveMeetingAction(null, {}, form({ data: d, prezenti: [committee[0], committee[1]] }));
    for (const d of ["2026-02-05", "2026-02-12", "2026-02-26"]) await saveMeetingAction(null, {}, form({ data: d, modPrezenta: "numar", numarPrezenti: "3" }));
    const flagged = await committeeAbsences(ctx, await getChurch(ctx));
    expect(flagged.map((f) => [f.name, f.count])).toEqual([["Pop Dan", 6]]); // the five + 10 January
    expect(flagged[0].meetings.length).toBe(6);
  });

  it("a General Assembly with 30 present: votes above 30 refused, the AG line with 30", async () => {
    const ag = { tip: "Adunare generală", data: "2026-04-12", modPrezenta: "numar", numarPrezenti: "30", puncte: JSON.stringify(["Bugetul"]) };
    const refused = await saveMeetingAction(null, {}, form({ ...ag, voturi: JSON.stringify([{ pentru: 25, contra: 5, abtineri: 1, secret: false }]) }));
    expect(refused.errors?.voturi).toBe("Punctul 1: 31 voturi, mai multe decât prezenții (30).");
    await saveMeetingAction(null, {}, form({ ...ag, voturi: JSON.stringify([{ pentru: 25, contra: 4, abtineri: 1, secret: false }]) }));
    const id = await meetingOn("2026-04-12");
    const text = printToText(meetingSpec((await getMeeting(ctx, id))!, await getChurch(ctx)));
    expect(text).toContain("prezenți: 30");
    expect(text).toContain("Votat: pentru 25, contra 4, abțineri 1 — adoptat");
    expect(text).not.toContain("Absenți");
  });

  it("the backup keeps the number and no attendee rows", async () => {
    const other = await prisma.church.create({ data: { nume: "Copie", slug: "copie" } });
    const u = await prisma.user.create({ data: { churchId: other.id, email: "c@x.ro", name: "C", passwordHash: "x", role: "ADMIN" } });
    const target = { user: { ...ctx.user, id: u.id, role: "ADMIN", churchId: other.id }, db: scopeToChurch(prisma, other.id) } as Ctx;
    const data = toPrototypeJson(await loadBackup(ctx));
    addMeetingExtras(data.meetings as Record<string, Record<string, unknown>>, await loadMeetingExtras(ctx));
    const json = JSON.parse(JSON.stringify(data));
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    await importBackup(target, parsed.backup, "merge", { meetings: parseMeetingExtras(json) });
    const ag = await prisma.meeting.findFirstOrThrow({ where: { churchId: other.id, tip: "Adunare generală" }, include: { prezenti: true } });
    expect([ag.numarPrezenti, ag.prezenti.length]).toEqual([30, 0]);
    const byName = await prisma.meeting.findFirstOrThrow({ where: { churchId: other.id, data: new Date("2026-01-10T00:00:00Z") }, include: { prezenti: true } });
    expect([byName.numarPrezenti, byName.prezenti.length]).toEqual([null, 3]);
  });
});
