import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { addMeetingExtras, parseMeetingExtras } from "@/lib/meeting-backup";
import { expectedAttendees } from "@/server/queries/attendance";
import { importBackup, loadBackup, loadMeetingExtras } from "@/server/backup";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe.skipIf(!hasTestDb)("meeting attendance rules", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({
      user: { id: userId, name: "Admin", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" },
      db: scopeToChurch(prisma, churchId),
    }) as Ctx;
  let a: Ctx;
  let b: Ctx;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase(prisma);
    const ca = await prisma.church.create({ data: { nume: "A", slug: "biserica-a" } });
    const cb = await prisma.church.create({ data: { nume: "B", slug: "biserica-b" } });
    const ua = await prisma.user.create({ data: { churchId: ca.id, email: "a@x.ro", name: "A", passwordHash: "x", role: "ADMIN" } });
    const ub = await prisma.user.create({ data: { churchId: cb.id, email: "b@x.ro", name: "B", passwordHash: "x", role: "ADMIN" } });
    a = ctxFor(ca.id, ua.id);
    b = ctxFor(cb.id, ub.id);
    const person = async (key: string, data: Record<string, unknown>, church = ca.id) =>
      (ids[key] = (await prisma.person.create({ data: { churchId: church, nume: key, ...data } as never })).id);
    await person("membru", { statut: "MEMBRU", dataMembru: day("2020-01-01") });
    await person("nou", { statut: "MEMBRU", dataMembru: day("2026-06-01") });
    await person("prieten", { statut: "PRIETEN" });
    await person("plecat", { statut: "FOST_MEMBRU", dataIesire: day("2025-01-01") });
    await person("diacon", { statut: "MEMBRU" });
    await person("dinAltaBiserica", { statut: "MEMBRU" }, cb.id);
    const diacon = await prisma.churchRole.create({ data: { churchId: ca.id, nume: "Diacon", inCommittee: true } });
    const cor = await prisma.churchRole.create({ data: { churchId: ca.id, nume: "Lider cor" } });
    await prisma.personRole.createMany({
      data: [
        { personId: ids.diacon, roleId: diacon.id, since: day("2024-01-01") },
        { personId: ids.membru, roleId: cor.id },
      ],
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("Toți membrii: members in the record who had joined by the meeting date", async () => {
    expect((await expectedAttendees(a.db, "TOTI", "2026-09-01")).sort()).toEqual([ids.membru, ids.nou, ids.diacon].sort());
    expect((await expectedAttendees(a.db, "TOTI", "2026-01-01")).sort()).toEqual([ids.membru, ids.diacon].sort());
    expect(await expectedAttendees(b.db, "TOTI", "2026-09-01")).toEqual([ids.dinAltaBiserica]);
  });

  it("Comitetul: holders of a committee role on the meeting date; Manual: nobody", async () => {
    expect(await expectedAttendees(a.db, "COMITET", "2026-09-01")).toEqual([ids.diacon]);
    expect(await expectedAttendees(a.db, "COMITET", "2023-06-01")).toEqual([]);
    expect(await expectedAttendees(b.db, "COMITET", "2026-09-01")).toEqual([]);
    expect(await expectedAttendees(a.db, "MANUAL", "2026-09-01")).toEqual([]);
  });

  it("absentees and the expected count survive export → import", async () => {
    await a.db.meeting.create({
      data: {
        tip: "Comitet",
        data: day("2026-09-01"),
        asteptati: 2,
        prezenti: { create: [{ personId: ids.diacon }, { personId: ids.membru, status: "ABSENT" }] },
      } as never,
    });
    const data = toPrototypeJson(await loadBackup(a));
    addMeetingExtras(data.meetings as Record<string, Record<string, unknown>>, await loadMeetingExtras(a));
    const json = JSON.parse(JSON.stringify(data));
    const meeting = Object.values(json.meetings)[0] as Record<string, unknown>;
    expect(meeting.prezenti).toEqual([ids.diacon]);
    expect(meeting.absenti).toEqual([ids.membru]);
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    await importBackup(b, parsed.backup, "merge", { meetings: parseMeetingExtras(json) });
    const m = await b.db.meeting.findFirstOrThrow({ include: { prezenti: { include: { person: true } } } });
    expect(m.asteptati).toBe(2);
    expect(m.prezenti.map((p) => [p.person.nume, p.status]).sort()).toEqual([
      ["diacon", "PRESENT"],
      ["membru", "ABSENT"],
    ]);
    expect(m.prezenti.every((p) => p.person.churchId === b.user.churchId)).toBe(true);
  });
});
