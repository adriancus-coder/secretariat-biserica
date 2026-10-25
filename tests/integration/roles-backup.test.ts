import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { addMemberRoles, parseRolesJson, rolesToJson } from "@/lib/roles-backup";
import { importBackup, loadBackup, loadRoles } from "@/server/backup";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("church roles in the JSON backup", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({
      user: { id: userId, name: "Admin", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" },
      db: scopeToChurch(prisma, churchId),
    }) as Ctx;
  let source: Ctx;
  let target: Ctx;

  async function exported(ctx: Ctx) {
    const [backup, roles] = await Promise.all([loadBackup(ctx), loadRoles(ctx)]);
    const data = toPrototypeJson(backup);
    addMemberRoles(data.members as Record<string, Record<string, unknown>>, roles.functii);
    return JSON.parse(JSON.stringify({ ...data, roles: rolesToJson(roles.roles) }));
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    const a = await prisma.church.create({ data: { nume: "Sursa", slug: "sursa" } });
    const b = await prisma.church.create({ data: { nume: "Destinatie", slug: "destinatie" } });
    const ua = await prisma.user.create({ data: { churchId: a.id, email: "ua@x.ro", name: "A", passwordHash: "x", role: "ADMIN" } });
    const ub = await prisma.user.create({ data: { churchId: b.id, email: "ub@x.ro", name: "B", passwordHash: "x", role: "ADMIN" } });
    source = ctxFor(a.id, ua.id);
    target = ctxFor(b.id, ub.id);
    const pastor = await prisma.churchRole.create({ data: { churchId: a.id, nume: "Pastor", sortOrder: 0, inCommittee: true } });
    const cor = await prisma.churchRole.create({ data: { churchId: a.id, nume: "Lider cor", sortOrder: 1 } });
    await prisma.churchRole.create({ data: { churchId: a.id, nume: "Casier", sortOrder: 2, inCommittee: true, active: false } });
    const p = await source.db.person.create({ data: { nume: "Mureșan", prenume: "Daniel", churchId: a.id } as never });
    await prisma.personRole.createMany({
      data: [
        { personId: p.id, roleId: pastor.id, since: new Date("2010-09-01T00:00:00Z") },
        { personId: p.id, roleId: cor.id },
      ],
    });
    // The target already has one role with a name from the file, which must be reused.
    await prisma.churchRole.create({ data: { churchId: b.id, nume: "Pastor", sortOrder: 5 } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("export → import restores the roles and the roles held by persons", async () => {
    const json = await exported(source);
    expect(json.members[Object.keys(json.members)[0]].functii).toEqual([
      { nume: "Pastor", din: "2010-09-01", pana: null },
      { nume: "Lider cor", din: null, pana: null },
    ]);
    const parsed = parsePrototypeJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const summary = await importBackup(target, parsed.backup, "merge", { roles: parseRolesJson(json) });
    expect(summary.functii).toBe(2);

    const roles = await target.db.churchRole.findMany({ orderBy: { sortOrder: "asc" } });
    expect(roles.map((r) => [r.nume, r.inCommittee, r.active])).toEqual([
      ["Pastor", true, true],
      ["Lider cor", false, true],
      ["Casier", true, false],
    ]);
    const person = await target.db.person.findFirstOrThrow({ include: { roles: { include: { role: true } } } });
    expect(person.roles.map((r) => [r.role.nume, r.since?.toISOString().slice(0, 10) ?? null]).sort()).toEqual([
      ["Lider cor", null],
      ["Pastor", "2010-09-01"],
    ]);
    expect(person.roles.every((r) => r.role.churchId === target.user.churchId)).toBe(true);
    expect(await source.db.churchRole.count()).toBe(3);
  });

  it("an older file without roles leaves the roles as they are", async () => {
    const json = await exported(source);
    delete json.roles;
    for (const m of Object.values(json.members) as Record<string, unknown>[]) delete m.functii;
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    const before = await target.db.churchRole.count();
    const summary = await importBackup(target, parsed.backup, "replace", { roles: parseRolesJson(json) });
    expect(summary.functii).toBe(0);
    expect(await target.db.churchRole.count()).toBe(before);
  });
});
