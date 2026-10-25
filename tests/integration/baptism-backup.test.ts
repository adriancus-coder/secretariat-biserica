import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { addMemberBaptism, parseMemberBaptism } from "@/lib/baptism-backup";
import { importBackup, loadBackup, loadBaptism } from "@/server/backup";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("baptism details in the JSON backup", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({ user: { id: userId, name: "A", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" }, db: scopeToChurch(prisma, churchId) }) as Ctx;
  let source: Ctx;
  let target: Ctx;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [a, b] = await Promise.all(["sursa", "destinatie"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const [ua, ub] = await Promise.all(
      [a, b].map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `b${i}@x.ro`, name: "U", passwordHash: "x", role: "ADMIN" } })),
    );
    source = ctxFor(a.id, ua.id);
    target = ctxFor(b.id, ub.id);
    await prisma.person.create({
      data: { churchId: a.id, nume: "Pop", prenume: "Ioana", botezBiserica: "Betel", botezLocalitate: "Oslo", botezOficiant: "Ioan Ardelean" },
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("export → import keeps church, locality and officiant; the officiant is searchable", async () => {
    const data = toPrototypeJson(await loadBackup(source));
    addMemberBaptism(data.members as Record<string, Record<string, unknown>>, await loadBaptism(source));
    const json = JSON.parse(JSON.stringify(data));
    const exported = Object.values(json.members)[0] as Record<string, string>;
    expect(exported).toMatchObject({ locBotez: "Oslo", botezBiserica: "Betel", botezLocalitate: "Oslo", botezOficiant: "Ioan Ardelean" });
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    await importBackup(target, parsed.backup, "replace", { baptism: parseMemberBaptism(json) });
    const p = await target.db.person.findFirstOrThrow();
    expect([p.botezBiserica, p.botezLocalitate, p.botezOficiant]).toEqual(["Betel", "Oslo", "Ioan Ardelean"]);
    expect(p.searchText).toContain("ioan ardelean");
  });

  it("an older file's locBotez becomes the locality", async () => {
    const json = { members: { m1: { id: "m1", nume: "Rusu", prenume: "Debora", statut: "membru", locBotez: "Râul Someș, Cluj" } } };
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(target, parsed.backup, "replace", { baptism: parseMemberBaptism(json) });
    const p = await target.db.person.findFirstOrThrow({ where: { nume: "Rusu" } });
    expect([p.botezBiserica, p.botezLocalitate, p.botezOficiant]).toEqual(["", "Râul Someș, Cluj", ""]);
  });
});
