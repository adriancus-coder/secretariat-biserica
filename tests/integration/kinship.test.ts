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

const { addKinLinkAction, checkKinLinksAction, confirmKinProposalAction, ignoreKinProposalAction, removeKinLinkAction } = await import("@/server/actions/kinship");
const { kinProposals, loadKinship, manualLinksToReview, personKinship, reconcileNameLinks } = await import("@/server/kinship");
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

  it("creates the links from the families once (idempotent), counts only: the head and Soț / Soție only", async () => {
    current = ctx;
    expect((await checkKinLinksAction()).message).toBe("Verificare încheiată: 0 legături greșite șterse · 3 legături adăugate din familii.");
    expect((await checkKinLinksAction()).message).toBe("Verificare încheiată: 0 legături greșite șterse · 0 legături adăugate din familii.");
    const links = await prisma.personParent.findMany({ select: { parentId: true, childId: true, source: true } });
    const name = (x: string) => Object.entries(id).find(([, v]) => v === x)![0];
    // Ana has no relation "Soție": Iosif is linked to Felix only.
    expect(links.map((l) => `${name(l.parentId!)}>${name(l.childId)}`).sort()).toEqual(["Dumitru>Maria", "Elena>Maria", "Felix>Iosif"]);
    expect(links.every((l) => l.source === "FAMILIE")).toBe(true);
  });

  it("links the head of one family to the head of another as a son; refuses a third parent, a cycle, another church, siblings", async () => {
    current = ctx;
    expect((await addKinLinkAction(id.Maria, "copil", id.Felix)).ok).toBe(true);
    // Maria and Felix both children of Dumitru: Felix as Maria's child is refused once both links exist.
    await prisma.personParent.deleteMany({ where: { parentId: id.Maria, childId: id.Felix } });
    expect((await addKinLinkAction(id.Felix, "parinte", id.Dumitru)).ok).toBe(true);
    expect((await addKinLinkAction(id.Elena, "copil", id.Felix)).ok).toBe(true);
    expect((await addKinLinkAction(id.Felix, "parinte", id.Ana)).message).toBe("Persoana are deja doi părinți în registru.");
    expect((await addKinLinkAction(id.Dumitru, "parinte", id.Iosif)).message).toBe("Legătura ar face din persoană strămoșul propriului părinte.");
    expect((await addKinLinkAction(id.Felix, "copil", id.strain)).message).toBe("Persoana nu există în registru.");
    expect((await addKinLinkAction(id.Maria, "copil", id.Felix)).message).toBe("Persoanele sunt frați; nu pot fi părinte și copil.");
    const log = await prisma.auditLog.findMany({ where: { entity: "PERSON", entityId: id.Felix } });
    expect(JSON.stringify(log)).toContain("legătură adăugată: Ciobanu Dumitru este părintele lui Ciobanu Felix");
  });

  it("deduces the relatives and one neam over both families", async () => {
    const k = await personKinship(ctx, id.Iosif, true);
    const by = Object.fromEntries(k!.groups.map((g) => [g.key, g.entries.map((e) => `${e.name} (${e.label})`)]));
    expect(by.parinti.sort()).toEqual(["Ciobanu Felix (tată)"]);
    expect(by.bunici.sort()).toEqual(["Ciobanu Dumitru (bunic)", "Ciobanu Elena (bunică)"]);
    expect(by.unchi).toEqual(["Ciobanu Maria (mătușă)"]);
    expect(k!.neam?.name).toBe("Neamul Ciobanu Dumitru");
    const { neamuri } = await loadKinship(ctx.db);
    expect(neamuri.map((n) => [n.name, n.persons, n.families, n.generations])).toEqual([["Neamul Ciobanu Dumitru", 5, 2, 3]]);
    expect((await loadKinship(other.db)).neamuri).toEqual([]);
  });

  it("removes a link (audited) and keeps the links through the JSON backup", async () => {
    current = ctx;
    const link = await prisma.personParent.findFirstOrThrow({ where: { parentId: id.Elena, childId: id.Felix } });
    expect((await removeKinLinkAction(link.id)).ok).toBe(true);
    const { data } = await buildExportJson(ctx);
    expect((data.rudenii as unknown[]).length).toBe(4);
    const parsed = parseImportJson(JSON.parse(JSON.stringify(data)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsePrototypeJson(data).ok).toBe(true);
    await importBackup(other, parsed.backup, "merge", parsed.extras);
    expect(await other.db.personParent.count()).toBe(4);
    expect((await loadKinship(other.db)).neamuri.map((n) => n.name)).toEqual(["Neamul Ciobanu Dumitru"]);
  });

  it("the Ciobanu case: a wrong link from the family is deleted, a wrong manual one is only reported", async () => {
    current = ctx;
    const fD = (await prisma.person.findUniqueOrThrow({ where: { id: id.Dumitru } })).familyId!;
    const thea = await prisma.person.create({ data: { churchId: ctx.user.churchId, nume: "Ciobanu", prenume: "Thea", familyId: fD, rudenie: "Fiică", dataNasterii: new Date("2012-01-01") } });
    // As if created before the fix: Thea as Felix's child (FAMILIE), and Maria as Felix's child by hand.
    await prisma.personParent.create({ data: { churchId: ctx.user.churchId, parentId: id.Felix, childId: thea.id, source: "FAMILIE" } });
    await prisma.personParent.create({ data: { churchId: ctx.user.churchId, parentId: id.Felix, childId: id.Maria, source: "MANUAL" } });
    expect((await checkKinLinksAction()).message).toBe(
      "Verificare încheiată: 1 legătură greșită ștearsă · 2 legături adăugate din familii · 1 legătură adăugată manual este în „De verificat”.",
    );
    const theaParents = (await prisma.personParent.findMany({ where: { childId: thea.id } })).map((l) => l.parentId).sort();
    expect(theaParents).toEqual([id.Dumitru, id.Elena].sort());
    const k = await personKinship(ctx, id.Felix, true);
    const by = Object.fromEntries(k!.groups.map((g) => [g.key, g.entries.map((e) => e.name)]));
    // Thea is Felix's sister now; the wrong manual link (Maria as his child) stays until someone removes it.
    expect(by.frati).toEqual(["Ciobanu Thea"]);
    expect(by.copii.sort()).toEqual(["Ciobanu Iosif", "Ciobanu Maria"]);
    expect(Object.fromEntries(k!.groups[1].entries.map((e) => [e.name, e.source]))).toEqual({ "Ciobanu Iosif": "din familie", "Ciobanu Maria": "adăugată manual" });
    expect(await manualLinksToReview(ctx.db)).toEqual([
      { id: expect.any(String), parent: { id: id.Felix, name: "Ciobanu Felix" }, child: { id: id.Maria, name: "Ciobanu Maria" }, reason: "Persoanele sunt frați; nu pot fi părinte și copil." },
    ]);
  });

  it("KINSHIP-STATUTE-PARENTS: the father found by numeTata is proposed, confirmed, and removed when the name changes", async () => {
    current = ctx;
    const vasile = await prisma.person.create({ data: { churchId: ctx.user.churchId, nume: "Lupu", prenume: "Vasile", gen: "M", dataNasterii: new Date("1950-01-01") } });
    const ana = await prisma.person.update({ where: { id: id.Ana }, data: { numeTata: "vasile LUPU", dataNasterii: new Date("1988-01-01") } });
    const proposals = await kinProposals(ctx.db);
    const p = proposals.find((x) => x.kind === "parinte" && x.childId === ana.id)!;
    expect(p.text).toBe("Lupu Vasile este tatăl lui Ciobanu Ana");
    expect((await confirmKinProposalAction(p.key)).ok).toBe(true);
    const link = await prisma.personParent.findFirstOrThrow({ where: { parentId: vasile.id, childId: ana.id } });
    expect(link.source).toBe("NUME_PARINTI");
    expect((await kinProposals(ctx.db)).some((x) => x.key === p.key)).toBe(false);
    const k = await personKinship(ctx, ana.id, true);
    expect(k!.groups[0].entries.map((e) => [e.name, e.source])).toEqual([["Lupu Vasile", "după numele părinților"]]);
    // The file no longer carries the name: the link goes at the next save.
    await prisma.person.update({ where: { id: ana.id }, data: { numeTata: "Lupu Ion" } });
    expect(await reconcileNameLinks(ctx.db, ana.id)).toBe(1);
    expect(await prisma.personParent.count({ where: { childId: ana.id, parentId: vasile.id } })).toBe(0);
  });

  it("two heads of family with the same parents' names outside the register: siblings, cousins, one neam; Ignoră is remembered", async () => {
    current = ctx;
    const mk = async (prenume: string, familyNume: string) => {
      const f = await prisma.family.create({ data: { churchId: ctx.user.churchId, nume: familyNume } });
      const head = await prisma.person.create({ data: { churchId: ctx.user.churchId, nume: "Rusu", prenume, gen: "M", familyId: f.id, rudenie: "Cap de familie", numeTata: "Rusu Petru", numeMama: "Rusu Elena" } });
      const kid = await prisma.person.create({ data: { churchId: ctx.user.churchId, nume: "Rusu", prenume: `${prenume}-copil`, familyId: f.id, rudenie: "Fiu", dataNasterii: new Date("2015-01-01") } });
      await prisma.family.update({ where: { id: f.id }, data: { headId: head.id } });
      await prisma.personParent.create({ data: { churchId: ctx.user.churchId, parentId: head.id, childId: kid.id, source: "FAMILIE" } });
      return { head, kid };
    };
    const a = await mk("Andrei", "Fam. Andrei Rusu");
    await mk("Bogdan", "Fam. Bogdan Rusu");
    const p = (await kinProposals(ctx.db)).find((x) => x.kind === "frati" && x.childIds.includes(a.head.id))!;
    expect(p.text).toBe("Rusu Andrei și Rusu Bogdan sunt frați, cu părinții în afara registrului Rusu Petru și Rusu Elena");
    expect((await confirmKinProposalAction(p.key)).message).toBe("Au fost create 4 legături.");
    expect(await prisma.kinExternalParent.count({ where: { churchId: ctx.user.churchId } })).toBe(2);
    const k = await personKinship(ctx, a.head.id, true);
    const by = Object.fromEntries(k!.groups.map((g) => [g.key, g.entries.map((e) => (e.external ? `${e.name} (nu e în registru)` : e.name))]));
    expect(by.frati).toEqual(["Rusu Bogdan"]);
    expect(by.parinti.sort()).toEqual(["Rusu Elena (nu e în registru)", "Rusu Petru (nu e în registru)"]);
    expect(Object.fromEntries((await personKinship(ctx, a.kid.id, true))!.groups.map((g) => [g.key, g.entries.map((e) => e.name)])).veri).toEqual(["Rusu Bogdan-copil"]);
    const neam = (await loadKinship(ctx.db)).neamuri.find((n) => n.members.includes(a.head.id))!;
    expect([neam.persons, neam.families, neam.generations]).toEqual([4, 2, 3]);
    // Ignoră: a third person with the same names is proposed, ignored, and not shown again.
    const c = await prisma.person.create({ data: { churchId: ctx.user.churchId, nume: "Rusu", prenume: "Cezar", gen: "M", numeTata: "Rusu Petru", numeMama: "Rusu Elena" } });
    const q = (await kinProposals(ctx.db)).filter((x) => (x.kind === "extern" ? x.childId : "") === c.id);
    expect(q).toHaveLength(2);
    expect((await ignoreKinProposalAction(q[0].key)).ok).toBe(true);
    expect((await kinProposals(ctx.db)).map((x) => x.key)).not.toContain(q[0].key);
    // Removing every link of a parent outside the register deletes it.
    for (const l of await prisma.personParent.findMany({ where: { externalParent: { nume: "Rusu Elena" } } })) await removeKinLinkAction(l.id);
    expect(await prisma.kinExternalParent.count({ where: { nume: "Rusu Elena" } })).toBe(0);
    // The backup keeps the parent outside the register and its links.
    const { data } = await buildExportJson(ctx);
    expect(data.parintiExterni).toEqual([{ id: expect.any(String), nume: "Rusu Petru", gen: "M" }]);
    expect((data.rudenii as { parinteExtern?: string }[]).filter((r) => r.parinteExtern)).toHaveLength(2);
  });
});
