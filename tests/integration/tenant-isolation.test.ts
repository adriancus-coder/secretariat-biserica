import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("izolarea datelor între biserici", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let churchA: string;
  let churchB: string;
  let personA: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchA = (await prisma.church.create({ data: { nume: "Betel", slug: "betel" } })).id;
    churchB = (await prisma.church.create({ data: { nume: "Maranata", slug: "maranata" } })).id;
    const a = scopeToChurch(prisma, churchA);
    personA = (await a.person.create({ data: { nume: "Popescu", prenume: "Ion" } as never })).id;
    await a.document.create({
      data: { tip: "adeverinta", nr: 1, anRegistru: 2026, data: new Date("2026-01-10"), text: "x" } as never,
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("creările primesc automat churchId", async () => {
    const p = await prisma.person.findUniqueOrThrow({ where: { id: personA } });
    expect(p.churchId).toBe(churchA);
  });

  it("citirile nu văd datele altei biserici", async () => {
    const b = scopeToChurch(prisma, churchB);
    expect(await b.person.findUnique({ where: { id: personA } })).toBeNull();
    expect(await b.person.findFirst({ where: { nume: "Popescu" } })).toBeNull();
    expect(await b.person.count()).toBe(0);
    expect(await b.document.findMany()).toHaveLength(0);
    const a = scopeToChurch(prisma, churchA);
    expect(await a.person.count()).toBe(1);
  });

  it("modificările și ștergerile nu ating datele altei biserici", async () => {
    const b = scopeToChurch(prisma, churchB);
    await expect(b.person.update({ where: { id: personA }, data: { nume: "X" } })).rejects.toMatchObject({
      code: "P2025",
    });
    expect((await b.person.updateMany({ data: { nume: "X" } })).count).toBe(0);
    expect((await b.person.deleteMany({})).count).toBe(0);
    await expect(b.person.delete({ where: { id: personA } })).rejects.toMatchObject({ code: "P2025" });
    const p = await prisma.person.findUniqueOrThrow({ where: { id: personA } });
    expect(p.nume).toBe("Popescu");
  });

  it("cererile de membru sunt izolate pe biserici", async () => {
    const a = scopeToChurch(prisma, churchA);
    const b = scopeToChurch(prisma, churchB);
    const app = await a.application.create({ data: { kind: "TRANSFER", nume: "Ionescu", consent: true } as never });
    expect(app.churchId).toBe(churchA);
    expect(await b.application.findUnique({ where: { id: app.id } })).toBeNull();
    expect(await b.application.findMany()).toHaveLength(0);
    expect(await b.application.count()).toBe(0);
    expect((await b.application.updateMany({ data: { status: "REJECTED" } })).count).toBe(0);
    await expect(b.application.update({ where: { id: app.id }, data: { status: "ACCEPTED" } })).rejects.toMatchObject({
      code: "P2025",
    });
    expect((await b.application.deleteMany({})).count).toBe(0);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("PENDING");
    expect(await a.application.count()).toBe(1);
  });

  it("filtrul se păstrează în tranzacții interactive", async () => {
    const b = scopeToChurch(prisma, churchB);
    const count = await b.$transaction(async (tx) => tx.person.count());
    expect(count).toBe(0);
  });

  it("datele calendaristice se păstrează exact (fără decalaj de fus orar)", async () => {
    const a = scopeToChurch(prisma, churchA);
    const p = await a.person.update({
      where: { id: personA },
      data: { dataNasterii: new Date("1990-03-01T00:00:00.000Z") },
    });
    expect(p.dataNasterii?.toISOString().slice(0, 10)).toBe("1990-03-01");
  });
});
