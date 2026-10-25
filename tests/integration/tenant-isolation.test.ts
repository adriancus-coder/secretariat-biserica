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

  it("funcțiile din biserică sunt izolate pe biserici", async () => {
    const a = scopeToChurch(prisma, churchA);
    const b = scopeToChurch(prisma, churchB);
    const groupA = await a.roleGroup.create({ data: { nume: "Funcții" } as never });
    const groupB = await b.roleGroup.create({ data: { nume: "Funcții" } as never });
    expect(groupA.churchId).toBe(churchA);
    expect(await b.roleGroup.findUnique({ where: { id: groupA.id } })).toBeNull();
    expect(await b.roleGroup.count()).toBe(1);
    const role = await a.churchRole.create({ data: { nume: "Diacon", groupId: groupA.id } as never });
    expect(role.churchId).toBe(churchA);
    // The same name is allowed in another church.
    await b.churchRole.create({ data: { nume: "Diacon", groupId: groupB.id } as never });
    expect(await b.churchRole.findUnique({ where: { id: role.id } })).toBeNull();
    expect(await b.churchRole.findMany({ where: { groupId: groupA.id } })).toHaveLength(0);
    expect(await b.churchRole.count()).toBe(1);
    expect((await b.churchRole.updateMany({ data: { active: false } })).count).toBe(1);
    await expect(b.churchRole.update({ where: { id: role.id }, data: { nume: "X" } })).rejects.toMatchObject({ code: "P2025" });
    await expect(b.churchRole.delete({ where: { id: role.id } })).rejects.toMatchObject({ code: "P2025" });
    const kept = await prisma.churchRole.findUniqueOrThrow({ where: { id: role.id } });
    expect([kept.nume, kept.active]).toEqual(["Diacon", true]);
    // Persons are reached through the scoped role: church B sees no holders of church A's role.
    await prisma.personRole.create({ data: { personId: personA, roleId: role.id } });
    expect(await b.person.count({ where: { roles: { some: { roleId: role.id } } } })).toBe(0);
    expect(await a.person.count({ where: { roles: { some: { roleId: role.id } } } })).toBe(1);
  });

  it("familiile sunt izolate pe biserici", async () => {
    const a = scopeToChurch(prisma, churchA);
    const b = scopeToChurch(prisma, churchB);
    const fam = await a.family.create({ data: { nume: "Fam. Ion Popescu", headId: personA } as never });
    expect(fam.churchId).toBe(churchA);
    await a.person.update({ where: { id: personA }, data: { familyId: fam.id } });
    expect(await b.family.findUnique({ where: { id: fam.id } })).toBeNull();
    expect(await b.family.findMany()).toHaveLength(0);
    expect(await b.family.count()).toBe(0);
    expect((await b.family.updateMany({ data: { nume: "X" } })).count).toBe(0);
    await expect(b.family.update({ where: { id: fam.id }, data: { nume: "X" } })).rejects.toMatchObject({ code: "P2025" });
    expect((await b.family.deleteMany({})).count).toBe(0);
    expect(await b.person.count({ where: { familyId: fam.id } })).toBe(0);
    expect((await prisma.family.findUniqueOrThrow({ where: { id: fam.id } })).nume).toBe("Fam. Ion Popescu");
  });

  it("church documents (statutes) are isolated per church", async () => {
    const a = scopeToChurch(prisma, churchA);
    const b = scopeToChurch(prisma, churchB);
    const pdf = new Uint8Array(Buffer.from("%PDF-1.7 test"));
    const doc = await a.churchDocument.create({ data: { kind: "STATUT_CULT", fileName: "statut.pdf", size: pdf.length, pdf } as never });
    expect(doc.churchId).toBe(churchA);
    expect(await b.churchDocument.findUnique({ where: { id: doc.id } })).toBeNull();
    expect(await b.churchDocument.findFirst({ where: { kind: "STATUT_CULT" } })).toBeNull();
    expect(await b.churchDocument.count()).toBe(0);
    expect((await b.churchDocument.updateMany({ data: { fileName: "x.pdf" } })).count).toBe(0);
    expect((await b.churchDocument.deleteMany({})).count).toBe(0);
    // The same kind can exist once per church.
    const other = await b.churchDocument.create({ data: { kind: "STATUT_CULT", fileName: "b.pdf", size: pdf.length, pdf } as never });
    expect(other.churchId).toBe(churchB);
    expect((await prisma.churchDocument.findUniqueOrThrow({ where: { id: doc.id } })).fileName).toBe("statut.pdf");
  });

  it("other forms of persons' names (aliases) are isolated per church", async () => {
    const a = scopeToChurch(prisma, churchA);
    const b = scopeToChurch(prisma, churchB);
    const alias = await a.personAlias.create({ data: { personId: personA, alias: "ion popescu-vechi" } as never });
    expect(alias.churchId).toBe(churchA);
    expect(await b.personAlias.findUnique({ where: { id: alias.id } })).toBeNull();
    expect(await b.personAlias.findFirst({ where: { alias: "ion popescu-vechi" } })).toBeNull();
    expect(await b.personAlias.count()).toBe(0);
    expect((await b.personAlias.updateMany({ data: { alias: "x" } })).count).toBe(0);
    expect((await b.personAlias.deleteMany({})).count).toBe(0);
    await expect(b.personAlias.delete({ where: { id: alias.id } })).rejects.toMatchObject({ code: "P2025" });
    // The same form of a name can exist once per church.
    const personB = (await b.person.create({ data: { nume: "Rusu", prenume: "Ion" } as never })).id;
    const other = await b.personAlias.create({ data: { personId: personB, alias: "ion popescu-vechi" } as never });
    expect(other.churchId).toBe(churchB);
    expect((await prisma.personAlias.findUniqueOrThrow({ where: { id: alias.id } })).personId).toBe(personA);
    await prisma.person.delete({ where: { id: personB } });
    expect(await b.personAlias.count()).toBe(0);
  });

  it("disciplinary measures are isolated per church", async () => {
    const a = scopeToChurch(prisma, churchA);
    const b = scopeToChurch(prisma, churchB);
    const m = await a.disciplinaryMeasure.create({ data: { personId: personA, forma: "SUSPENDARE", dataInceput: new Date("2026-03-01") } as never });
    expect(m.churchId).toBe(churchA);
    expect(await b.disciplinaryMeasure.findUnique({ where: { id: m.id } })).toBeNull();
    expect(await b.disciplinaryMeasure.findFirst({ where: { personId: personA } })).toBeNull();
    expect(await b.disciplinaryMeasure.count()).toBe(0);
    expect((await b.disciplinaryMeasure.updateMany({ data: { motiv: "x" } })).count).toBe(0);
    expect((await b.disciplinaryMeasure.deleteMany({})).count).toBe(0);
    await expect(b.disciplinaryMeasure.delete({ where: { id: m.id } })).rejects.toMatchObject({ code: "P2025" });
    expect((await prisma.disciplinaryMeasure.findUniqueOrThrow({ where: { id: m.id } })).motiv).toBe("");
    await a.disciplinaryMeasure.delete({ where: { id: m.id } });
  });

  it("data-update campaigns and their links are isolated per church", async () => {
    const a = scopeToChurch(prisma, churchA);
    const b = scopeToChurch(prisma, churchB);
    const c = await a.dataCampaign.create({ data: { nume: "Actualizare", deadline: new Date("2026-12-01"), privacyTextVersion: "v" } as never });
    const l = await a.dataUpdateLink.create({
      data: { campaignId: c.id, personId: personA, nonce: "n", tokenHash: "h-isolation", expiresAt: new Date("2026-12-01T23:59:59Z") } as never,
    });
    expect([c.churchId, l.churchId]).toEqual([churchA, churchA]);
    expect(await b.dataCampaign.findUnique({ where: { id: c.id } })).toBeNull();
    expect(await b.dataUpdateLink.findUnique({ where: { id: l.id } })).toBeNull();
    expect(await b.dataUpdateLink.findFirst({ where: { tokenHash: "h-isolation" } })).toBeNull();
    expect([await b.dataCampaign.count(), await b.dataUpdateLink.count()]).toEqual([0, 0]);
    expect((await b.dataUpdateLink.updateMany({ data: { failedChecks: 9 } })).count).toBe(0);
    expect((await b.dataCampaign.deleteMany({})).count).toBe(0);
    expect((await prisma.dataUpdateLink.findUniqueOrThrow({ where: { id: l.id } })).failedChecks).toBe(0);
    await a.dataCampaign.delete({ where: { id: c.id } });
    expect(await prisma.dataUpdateLink.findUnique({ where: { id: l.id } })).toBeNull();
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
