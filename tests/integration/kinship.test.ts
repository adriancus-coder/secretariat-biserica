import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

// The actions run with the context set by each test (the real session needs a request).
let current: Ctx;
vi.mock("@/server/session", () => ({
  ActionError: class ActionError extends Error {},
  actionCtx: async () => current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { addKinLinkAction, createFamilyLinksAction, removeKinLinkAction } = await import("@/server/actions/kinship");
const { loadKinship, personKinship } = await import("@/server/kinship");
const { parsePrototypeJson } = await import("@/domain/backup");
const { importBackup } = await import("@/server/backup");
const { buildExportJson, parseImportJson } = await import("@/server/backup-json");

/** KINSHIP on the database: links from families, manual links and their rules, deduction, backup. */
describe.skipIf(!hasTestDb)("kinship", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let other: Ctx;
  const id: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [ca, cb] = await Promise.all(["kin-a", "kin-b"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const [ua, ub] = await Promise.all([ca, cb].map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `k${i}@x.ro`, name: "Admin", passwordHash: "x", role: "ADMIN" } })));
    ctx = { user: { id: ua.id, name: "Admin", email: "k0@x.ro", role: "ADMIN", isPastor: false, churchId: ca.id, churchName: "A" }, db: scopeToChurch(prisma, ca.id) } as Ctx;
    other = { user: { id: ub.id, name: "Admin", email: "k1@x.ro", role: "ADMIN", isPastor: false, churchId: cb.id, churchName: "B" }, db: scopeToChurch(prisma, cb.id) } as Ctx;
    const family = async (key: string, members: [string, string, Record<string, unknown>][]) => {
      const f = await prisma.family.create({ data: { churchId: ca.id, nume: `Fam. ${members[0][1]} ${members[0][0]}` } });
      for (const [nume, prenume, extra] of members) id[prenume] = (await prisma.person.create({ data: { churchId: ca.id, nume, prenume, sortKey: `${nume} ${prenume}`, familyId: f.id, ...extra } as never })).id;
      await prisma.family.update({ where: { id: f.id }, data: { headId: id[members[0][1]] } });
      id[key] = f.id;
    };
    // Dumitru's family, and his son Felix's own family (married head, wife without a relation).
    await family("fD", [
      ["Ciobanu", "Dumitru", { rudenie: "Cap de familie", gen: "M" }],
      ["Ciobanu", "Elena", { rudenie: "Soție", gen: "F" }],
      ["Ciobanu", "Maria", { rudenie: "Fiică", gen: "F" }],
    ]);
    await family("fF", [
      ["Ciobanu", "Felix", { rudenie: "Cap de familie", gen: "M", dataCasatoriei: new Date("2015-06-01") }],
      ["Ciobanu", "Ana", { rudenie: "", gen: "F" }],
      ["Ciobanu", "Iosif", { rudenie: "Fiu", gen: "M", dataNasterii: new Date("2020-01-01") }],
    ]);
    id.strain = (await prisma.person.create({ data: { churchId: cb.id, nume: "Străin", prenume: "Ion" } })).id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("creates the links from the families once (idempotent), counts only", async () => {
    current = ctx;
    expect((await createFamilyLinksAction()).message).toBe("Au fost create 4 legături părinte–copil.");
    expect((await createFamilyLinksAction()).message).toBe("Nu era nicio legătură nouă de creat.");
    const links = await prisma.personParent.findMany({ select: { parentId: true, childId: true, source: true } });
    expect(links.map((l) => `${l.parentId === id.Dumitru ? "Dumitru" : l.parentId === id.Elena ? "Elena" : l.parentId === id.Felix ? "Felix" : "Ana"}>${l.childId === id.Maria ? "Maria" : "Iosif"}`).sort()).toEqual([
      "Ana>Iosif",
      "Dumitru>Maria",
      "Elena>Maria",
      "Felix>Iosif",
    ]);
    expect(links.every((l) => l.source === "FAMILIE")).toBe(true);
  });

  it("links the head of one family to the head of another as a son; refuses a third parent, a cycle, another church", async () => {
    current = ctx;
    expect((await addKinLinkAction(id.Felix, "parinte", id.Dumitru)).ok).toBe(true);
    expect((await addKinLinkAction(id.Elena, "copil", id.Felix)).ok).toBe(true);
    expect((await addKinLinkAction(id.Felix, "parinte", id.Maria)).message).toBe("Persoana are deja doi părinți în registru.");
    expect((await addKinLinkAction(id.Dumitru, "parinte", id.Iosif)).message).toBe("Legătura ar face din persoană strămoșul propriului părinte.");
    expect((await addKinLinkAction(id.Felix, "copil", id.strain)).message).toBe("Persoana nu există în registru.");
    const log = await prisma.auditLog.findMany({ where: { entity: "PERSON", entityId: id.Felix } });
    expect(JSON.stringify(log)).toContain("legătură adăugată: Ciobanu Dumitru este părintele lui Ciobanu Felix");
  });

  it("deduces the relatives and one neam over both families", async () => {
    const k = await personKinship(ctx, id.Iosif, true);
    const by = Object.fromEntries(k!.groups.map((g) => [g.key, g.entries.map((e) => `${e.name} (${e.label})`)]));
    expect(by.parinti.sort()).toEqual(["Ciobanu Ana (mamă)", "Ciobanu Felix (tată)"]);
    expect(by.bunici.sort()).toEqual(["Ciobanu Dumitru (bunic)", "Ciobanu Elena (bunică)"]);
    expect(by.unchi).toEqual(["Ciobanu Maria (mătușă)"]);
    expect(k!.neam?.name).toBe("Neamul Ciobanu Dumitru");
    const { neamuri } = await loadKinship(ctx.db);
    expect(neamuri.map((n) => [n.name, n.persons, n.families, n.generations])).toEqual([["Neamul Ciobanu Dumitru", 6, 2, 3]]);
    expect((await loadKinship(other.db)).neamuri).toEqual([]);
  });

  it("removes a link (audited) and keeps the links through the JSON backup", async () => {
    current = ctx;
    const link = await prisma.personParent.findFirstOrThrow({ where: { parentId: id.Elena, childId: id.Felix } });
    expect((await removeKinLinkAction(link.id)).ok).toBe(true);
    const { data } = await buildExportJson(ctx);
    expect((data.rudenii as unknown[]).length).toBe(5);
    const parsed = parseImportJson(JSON.parse(JSON.stringify(data)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsePrototypeJson(data).ok).toBe(true);
    await importBackup(other, parsed.backup, "merge", parsed.extras);
    expect(await other.db.personParent.count()).toBe(5);
    expect((await loadKinship(other.db)).neamuri.map((n) => n.name)).toEqual(["Neamul Ciobanu Dumitru"]);
  });
});
