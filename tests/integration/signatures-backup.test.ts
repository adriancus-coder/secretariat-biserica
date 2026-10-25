import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { addMeetingExtras, parseMeetingExtras } from "@/lib/meeting-backup";
import { importBackup, loadBackup, loadMeetingExtras } from "@/server/backup";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("meeting signatures in the JSON backup", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({ user: { id: userId, name: "A", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" }, db: scopeToChurch(prisma, churchId) }) as Ctx;
  let source: Ctx;
  let target: Ctx;
  let png: Buffer;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [a, b] = await Promise.all(["sursa", "destinatie"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const [ua, ub] = await Promise.all(
      [a, b].map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `s${i}@x.ro`, name: "U", passwordHash: "x", role: "ADMIN" } })),
    );
    source = ctxFor(a.id, ua.id);
    target = ctxFor(b.id, ub.id);
    png = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const ioana = await prisma.person.create({ data: { churchId: a.id, nume: "Pop", prenume: "Ioana" } });
    const ion = await prisma.person.create({ data: { churchId: a.id, nume: "Popescu", prenume: "Ion" } });
    await prisma.meeting.create({
      data: {
        churchId: a.id,
        tip: "Comitet",
        data: new Date("2026-09-11T00:00:00Z"),
        locked: true,
        lockedAt: new Date("2026-09-11T18:00:00Z"),
        prezenti: { create: [{ personId: ioana.id }, { personId: ion.id }] },
        signatures: { create: [{ personId: ioana.id, imagePng: new Uint8Array(png), signedAt: new Date("2026-09-11T17:42:00Z") }] },
      },
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("export → import restores the signatures (as base64 PNG) and the closed state", async () => {
    const data = toPrototypeJson(await loadBackup(source));
    addMeetingExtras(data.meetings as Record<string, Record<string, unknown>>, await loadMeetingExtras(source));
    const json = JSON.parse(JSON.stringify(data));
    const exported = Object.values(json.meetings)[0] as { semnaturi: { imagine: string }[]; inchisLa: string };
    expect(exported.semnaturi).toHaveLength(1);
    expect(Buffer.from(exported.semnaturi[0].imagine, "base64").subarray(1, 4).toString()).toBe("PNG");
    expect(exported.inchisLa).toBe("2026-09-11T18:00:00.000Z");
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    await importBackup(target, parsed.backup, "merge", { meetings: parseMeetingExtras(json) });
    const m = await target.db.meeting.findFirstOrThrow({ include: { signatures: { include: { person: true } } } });
    expect(m.locked).toBe(true);
    expect(m.signatures.map((s) => [s.person.prenume, s.person.churchId === target.user.churchId, s.signedAt.toISOString()])).toEqual([
      ["Ioana", true, "2026-09-11T17:42:00.000Z"],
    ]);
  });

  it("an older file without signatures imports unchanged", async () => {
    const json = { meetings: { m9: { id: "m9", tip: "Comitet", data: "2026-01-10", prezenti: [] } } };
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    await importBackup(target, parsed.backup, "merge", { meetings: parseMeetingExtras(json) });
    const m = await target.db.meeting.findFirstOrThrow({ where: { data: new Date("2026-01-10T00:00:00Z") }, include: { signatures: true } });
    expect([m.locked, m.signatures.length]).toEqual([false, 0]);
  });
});
