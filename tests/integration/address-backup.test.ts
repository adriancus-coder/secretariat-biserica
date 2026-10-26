import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { importBackup, loadBackup } from "@/server/backup";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("address in the JSON backup", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let source: Ctx;
  let target: Ctx;

  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({ user: { id: userId, name: "Admin", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" }, db: scopeToChurch(prisma, churchId) }) as Ctx;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const churches = await Promise.all(
      [
        { slug: "sursa", adresa: "Storgata 5", codPostal: "4005", localitate: "Stavanger" },
        { slug: "destinatie", adresa: "", codPostal: "", localitate: "" },
      ].map((c) => prisma.church.create({ data: { nume: c.slug, ...c } })),
    );
    const users = await Promise.all(churches.map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `u${i}@x.ro`, name: "U", passwordHash: "x", role: "ADMIN" } })));
    [source, target] = churches.map((c, i) => ctxFor(c.id, users[i].id));
    await prisma.person.create({ data: { churchId: churches[0].id, nume: "Pop", prenume: "Ion", adresa: "Ulveveien 20", codPostal: "4323", localitate: "Sandnes" } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("export → import keeps the three fields apart; an old single-line file is split", async () => {
    const json = JSON.parse(JSON.stringify(toPrototypeJson(await loadBackup(source))));
    const member = Object.values(json.members as Record<string, Record<string, string>>)[0];
    expect([member.adresa, member.codPostal, member.localitate]).toEqual(["Ulveveien 20", "4323", "Sandnes"]);
    expect(json.settings).toMatchObject({ adresa: "Storgata 5", codPostal: "4005", localitate: "Stavanger" });

    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(target, parsed.backup, "replace");
    const p = await target.db.person.findFirstOrThrow();
    expect([p.adresa, p.codPostal, p.localitate]).toEqual(["Ulveveien 20", "4323", "Sandnes"]);
    const church = await prisma.church.findUniqueOrThrow({ where: { id: target.user.churchId } });
    expect([church.adresa, church.codPostal, church.localitate]).toEqual(["Storgata 5", "4005", "Stavanger"]);

    const old = { members: { a: { id: "a", nume: "Rusu", prenume: "Debora", adresa: "ulveveien 20  4323 sandnes" }, b: { id: "b", nume: "Rusu", prenume: "Timotei", adresa: "Undeva în sat" } } };
    const oldParsed = parsePrototypeJson(old);
    if (!oldParsed.ok) throw new Error(oldParsed.errors.join("; "));
    await importBackup(target, oldParsed.backup, "replace");
    const rows = Object.fromEntries((await target.db.person.findMany()).map((x) => [x.prenume, [x.adresa, x.codPostal, x.localitate]]));
    expect(rows).toEqual({ Debora: ["Ulveveien 20", "4323", "Sandnes"], Timotei: ["Undeva în sat", "", ""] });
  });
});
