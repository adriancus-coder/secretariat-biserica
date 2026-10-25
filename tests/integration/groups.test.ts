import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { anonymizePerson } from "@/server/anonymize";
import { importBackup } from "@/server/backup";
import { syncRoleGroups } from "@/server/group-sync";
import { writePersonRoles } from "@/server/person-roles";
import { buildExportJson, parseImportJson } from "@/server/backup-json";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

// person-roles imports ValidationError from the actions, which import the session (next-auth): not needed here.
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {} }));

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

  describe("automatic members (syncRoleGroups)", () => {
    const roles = { worship: "", other: "" };
    let groupId = "";
    const person = async (prenume: string) => (await prisma.person.create({ data: { churchId: a.user.churchId, nume: "Sync", prenume, sortKey: `sync ${prenume}`, searchText: prenume } })).id;
    const members = async () =>
      (await prisma.groupMember.findMany({ where: { groupId }, select: { personId: true, sursa: true } })).map((m) => `${m.personId}:${m.sursa}`).sort();
    const giveRoles = (personId: string, roleIds: string[]) =>
      a.db.$transaction(async (tx) => {
        await syncRoleGroups(tx, a.user, { roleIds: await writePersonRoles(tx, personId, roleIds.map((roleId) => ({ roleId, since: null }))) });
      });

    beforeAll(async () => {
      const rg = await prisma.roleGroup.create({ data: { churchId: a.user.churchId, nume: "Sync" } });
      roles.worship = (await prisma.churchRole.create({ data: { churchId: a.user.churchId, groupId: rg.id, nume: "Sync laudă" } })).id;
      roles.other = (await prisma.churchRole.create({ data: { churchId: a.user.churchId, groupId: rg.id, nume: "Sync cor" } })).id;
      groupId = (await prisma.group.create({ data: { churchId: a.user.churchId, nume: "Sync grup", functieId: roles.worship } })).id;
    });

    it("a role given -> AUTO member; taken away -> out; a MANUAL member is never removed", async () => {
      const ana = await person("Ana");
      const manual = await person("Manual");
      await prisma.groupMember.create({ data: { groupId, personId: manual } });
      await giveRoles(ana, [roles.worship]);
      expect(await members()).toEqual([`${ana}:AUTO`, `${manual}:MANUAL`].sort());
      const audit = await prisma.auditLog.findFirst({ where: { entity: "GROUP", entityId: groupId }, orderBy: { createdAt: "desc" } });
      expect(audit?.changes).toMatchObject({ membri: ["Sync Manual", "Sync Ana, Sync Manual"], sursa: "actualizat din funcții" });
      await giveRoles(ana, []);
      expect(await members()).toEqual([`${manual}:MANUAL`]);
      await a.db.$transaction((tx) => syncRoleGroups(tx, a.user));
      expect(await members()).toEqual([`${manual}:MANUAL`]);
    });

    it("a MANUAL row of a holder becomes AUTO", async () => {
      const bob = await person("Bob");
      await prisma.groupMember.create({ data: { groupId, personId: bob } });
      await giveRoles(bob, [roles.worship]);
      expect(await members()).toContain(`${bob}:AUTO`);
    });

    it("a holder who becomes Fost membru, or is anonymised, leaves the group", async () => {
      const cici = await person("Cici");
      const dan = await person("Dan");
      await giveRoles(cici, [roles.worship]);
      await giveRoles(dan, [roles.worship]);
      expect(await members()).toEqual(expect.arrayContaining([`${cici}:AUTO`, `${dan}:AUTO`]));
      await prisma.person.update({ where: { id: cici }, data: { statut: "FOST_MEMBRU" } });
      await a.db.$transaction((tx) => syncRoleGroups(tx, a.user, { roleIds: [roles.worship] }));
      expect((await members()).some((m) => m.startsWith(cici))).toBe(false);
      await anonymizePerson(a, dan);
      expect((await members()).some((m) => m.startsWith(dan))).toBe(false);
    });

    it("a group relinked to another role gets that role's holders instead; unlinked keeps only MANUAL", async () => {
      const eva = await person("Eva");
      await giveRoles(eva, [roles.other]);
      const before = await members();
      await a.db.$transaction(async (tx) => {
        await tx.group.update({ where: { id: groupId }, data: { functieId: roles.other } });
        await syncRoleGroups(tx, a.user, { groupIds: [groupId] });
      });
      const after = await members();
      expect(after.filter((m) => m.endsWith(":AUTO"))).toEqual([`${eva}:AUTO`]);
      expect(after.filter((m) => m.endsWith(":MANUAL"))).toEqual(before.filter((m) => m.endsWith(":MANUAL")));
      await a.db.$transaction(async (tx) => {
        await tx.group.update({ where: { id: groupId }, data: { functieId: null } });
        await syncRoleGroups(tx, a.user, { groupIds: [groupId] });
      });
      expect((await members()).every((m) => m.endsWith(":MANUAL"))).toBe(true);
    });

    it("never touches another church's groups", async () => {
      const otherGroup = await prisma.group.create({ data: { churchId: b.user.churchId, nume: "Altă biserică", functieId: (await b.db.churchRole.findFirstOrThrow()).id } });
      await a.db.$transaction((tx) => syncRoleGroups(tx, a.user));
      expect(await prisma.groupMember.count({ where: { groupId: otherGroup.id } })).toBe(0);
    });
  });

  it("an older file (members without `sursa`) imports them as MANUAL, then holders become AUTO", async () => {
    const holder = await prisma.person.create({ data: { churchId: a.user.churchId, nume: "Vechi", prenume: "Deținător", sortKey: "vechi", searchText: "vechi" } });
    const extra = await prisma.person.create({ data: { churchId: a.user.churchId, nume: "Vechi", prenume: "Membru", sortKey: "vechi m", searchText: "vechi m" } });
    await prisma.personRole.create({ data: { personId: holder.id, roleId: ids.worship } });
    const g = await prisma.group.create({ data: { churchId: a.user.churchId, nume: "Grup vechi", functieId: ids.worship, membri: { create: [{ personId: holder.id }, { personId: extra.id }] } } });
    const { data } = await buildExportJson(a);
    const json = JSON.parse(JSON.stringify(data));
    delete json.groups[g.id].sursa;
    const parsed = parseImportJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(b, parsed.backup, "merge", parsed.extras);
    const imported = await b.db.group.findFirstOrThrow({ where: { nume: "Grup vechi" }, include: { membri: { include: { person: true } } } });
    expect(imported.membri.map((m) => `${m.person.prenume}:${m.sursa}`).sort()).toEqual(["Deținător:AUTO", "Membru:MANUAL"]);
  });
});
