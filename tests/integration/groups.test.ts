import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importBackup } from "@/server/backup";
import { buildExportJson, parseImportJson } from "@/server/backup-json";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("groups linked to roles", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({ user: { id: userId, name: "Admin", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" }, db: scopeToChurch(prisma, churchId) }) as Ctx;
  let a: Ctx;
  let b: Ctx;
  const ids = { worship: "", leader: "", group: "" };

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [ca, cb] = await Promise.all(["grupuri-a", "grupuri-b"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const [ua, ub] = await Promise.all([ca, cb].map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `g${i}@x.ro`, name: "Admin", passwordHash: "x", role: "ADMIN" } })));
    a = ctxFor(ca.id, ua.id);
    b = ctxFor(cb.id, ub.id);
    const rg = await prisma.roleGroup.create({ data: { churchId: ca.id, nume: "Slujiri" } });
    ids.worship = (await prisma.churchRole.create({ data: { churchId: ca.id, groupId: rg.id, nume: "Laudă și închinare" } })).id;
    ids.leader = (await prisma.churchRole.create({ data: { churchId: ca.id, groupId: rg.id, nume: "Lider laudă și închinare" } })).id;
    ids.group = (await prisma.group.create({ data: { churchId: ca.id, nume: "Echipa de laudă", functieId: ids.worship, functieLiderId: ids.leader } })).id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("export -> import keeps the linked roles by name, pointing at the target church's roles", async () => {
    const { data } = await buildExportJson(a);
    const json = JSON.parse(JSON.stringify(data));
    expect(Object.values(json.groups)[0]).toMatchObject({ functie: "Laudă și închinare", functieLider: "Lider laudă și închinare" });
    const parsed = parseImportJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(b, parsed.backup, "merge", parsed.extras);
    const g = await b.db.group.findFirstOrThrow({ include: { functie: true, functieLider: true } });
    expect([g.functie?.nume, g.functie?.churchId, g.functieLider?.nume]).toEqual(["Laudă și închinare", b.user.churchId, "Lider laudă și închinare"]);
  });

  it("deleting a role leaves its groups unlinked (SetNull)", async () => {
    await prisma.churchRole.delete({ where: { id: ids.leader } });
    const g = await a.db.group.findUniqueOrThrow({ where: { id: ids.group } });
    expect([g.functieId, g.functieLiderId]).toEqual([ids.worship, null]);
  });
});
