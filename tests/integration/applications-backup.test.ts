import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { applicationsToJson, parseApplicationsJson } from "@/lib/application-backup";
import { importBackup, loadApplications, loadBackup } from "@/server/backup";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("applications in the JSON backup", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({
      user: { id: userId, name: "Admin", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" },
      db: scopeToChurch(prisma, churchId),
    }) as Ctx;
  let source: Ctx;
  let target: Ctx;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const a = await prisma.church.create({ data: { nume: "Sursa", slug: "sursa" } });
    const b = await prisma.church.create({ data: { nume: "Destinatie", slug: "destinatie" } });
    const ua = await prisma.user.create({ data: { churchId: a.id, email: "ua@x.ro", name: "A", passwordHash: "x", role: "ADMIN" } });
    const ub = await prisma.user.create({ data: { churchId: b.id, email: "ub@x.ro", name: "B", passwordHash: "x", role: "ADMIN" } });
    source = ctxFor(a.id, ua.id);
    target = ctxFor(b.id, ub.id);
    const person = await source.db.person.create({ data: { nume: "Munteanu", prenume: "Andrei", churchId: a.id } as never });
    await source.db.application.create({
      data: { churchId: a.id, kind: "TRANSFER", nume: "Munteanu", prenume: "Andrei", consent: true, status: "ACCEPTED", personId: person.id },
    });
    await source.db.application.create({ data: { churchId: a.id, kind: "BOTEZ", nume: "Rusu", prenume: "Elena", consent: true } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("export → import into an empty church recreates applications and their person links", async () => {
    const json = JSON.parse(
      JSON.stringify({ ...toPrototypeJson(await loadBackup(source)), applications: applicationsToJson(await loadApplications(source)) }),
    );
    const parsed = parsePrototypeJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const apps = parseApplicationsJson(json, new Set(parsed.backup.members.map((m) => m.id)));
    const summary = await importBackup(target, parsed.backup, "merge", { applications: apps.applications });
    expect(summary.cereri).toBe(2);

    const imported = await target.db.application.findMany({ orderBy: { nume: "asc" }, include: { person: true } });
    expect(imported.map((x) => [x.nume, x.status])).toEqual([["Munteanu", "ACCEPTED"], ["Rusu", "PENDING"]]);
    expect(imported[0].person?.churchId).toBe(target.user.churchId);
    // Ids already used by the source church are remapped, never shared.
    expect(await source.db.application.count()).toBe(2);
  });
});
