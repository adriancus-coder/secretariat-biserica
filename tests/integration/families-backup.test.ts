import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { addMemberFamilies, familiesToJson, parseFamiliesJson } from "@/lib/families-backup";
import { importBackup, loadBackup, loadFamilies } from "@/server/backup";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe.skipIf(!hasTestDb)("families in the JSON backup", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({
      user: { id: userId, name: "Admin", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" },
      db: scopeToChurch(prisma, churchId),
    }) as Ctx;
  let source: Ctx;
  let target: Ctx;
  let empty: Ctx;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const churches = await Promise.all(["sursa", "destinatie", "goala"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const users = await Promise.all(
      churches.map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `u${i}@x.ro`, name: "U", passwordHash: "x", role: "ADMIN" } })),
    );
    [source, target, empty] = churches.map((c, i) => ctxFor(c.id, users[i].id));
    const a = churches[0].id;
    // Two families with the same surname.
    const mk = (nume: string, prenume: string, extra: Record<string, unknown> = {}) =>
      prisma.person.create({ data: { churchId: a, nume, prenume, ...extra } as never });
    const vasile = await mk("Pop", "Vasile", { gen: "M", dataNasterii: day("1985-02-02"), rudenie: "Cap de familie" });
    const ioana = await mk("Pop", "Ioana", { gen: "F", dataNasterii: day("1988-08-08"), rudenie: "Soție" });
    const andrei = await mk("Pop", "Andrei", { gen: "M", dataNasterii: day("1960-01-01") });
    const f1 = await prisma.family.create({ data: { churchId: a, nume: "Fam. Vasile Pop", headId: vasile.id, adresa: "Str. 1" } });
    const f2 = await prisma.family.create({ data: { churchId: a, nume: "Fam. Andrei Pop", headId: andrei.id } });
    await prisma.person.updateMany({ where: { id: { in: [vasile.id, ioana.id] } }, data: { familyId: f1.id } });
    await prisma.person.update({ where: { id: andrei.id }, data: { familyId: f2.id } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("export → import keeps two families with the same surname apart, with their heads", async () => {
    const data = toPrototypeJson(await loadBackup(source));
    const fams = await loadFamilies(source);
    addMemberFamilies(data.members as Record<string, Record<string, unknown>>, fams.familyOf);
    const json = JSON.parse(JSON.stringify({ ...data, families: familiesToJson(fams.families) }));
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    const summary = await importBackup(target, parsed.backup, "merge", { families: parseFamiliesJson(json) });
    expect(summary.familii).toBe(2);
    const imported = await target.db.family.findMany({ orderBy: { nume: "asc" }, include: { head: true, members: true } });
    expect(imported.map((f) => [f.nume, f.head?.prenume, f.members.length, f.adresa])).toEqual([
      ["Fam. Andrei Pop", "Andrei", 1, ""],
      ["Fam. Vasile Pop", "Vasile", 2, "Str. 1"],
    ]);
    expect(imported.every((f) => f.churchId === target.user.churchId && f.members.every((m) => m.churchId === target.user.churchId))).toBe(true);
  });

  it("an older file (family text only), on request, creates one family per text, marked as automatic", async () => {
    const json = {
      members: {
        a: { id: "a", nume: "Rusu", prenume: "Debora", gen: "F", familie: "Rusu", dataNasterii: "1997-05-05" },
        b: { id: "b", nume: "Rusu", prenume: "Timotei", gen: "M", familie: "Rusu", dataNasterii: "1995-01-15" },
        c: { id: "c", nume: "Lungu", prenume: "Ecaterina", gen: "F", familie: "Lungu", rudenie: "Soție", dataNasterii: "1953-07-07" },
        d: { id: "d", nume: "Lungu", prenume: "Gheorghe", gen: "M", familie: "Lungu", rudenie: "Cap de familie", dataNasterii: "1950-05-05" },
        e: { id: "e", nume: "Olsen", prenume: "Kari", familie: "" },
      },
    };
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const summary = await importBackup(empty, parsed.backup, "replace", { families: parseFamiliesJson(json), textFamilies: true });
    expect(summary.familii).toBe(2);
    const fams = await empty.db.family.findMany({ orderBy: { nume: "asc" }, include: { head: true, members: true } });
    expect(fams.map((f) => [f.nume, f.members.length, f.autoCreated])).toEqual([
      ["Fam. Gheorghe Lungu", 2, true],
      ["Fam. Timotei Rusu", 2, true],
    ]);
    expect(await empty.db.person.count({ where: { familyId: null } })).toBe(1);
  });

  it("by default an older file creates no family; the text stays on the person; heads are never minors", async () => {
    const json = {
      members: {
        a: { id: "a", nume: "Rusu", prenume: "Debora", familie: "Rusu" },
        b: { id: "b", nume: "Rusu", prenume: "Timotei", familie: "Rusu" },
        k: { id: "k", nume: "Rusu", prenume: "Ana", statut: "copil", familie: "Rusu", rudenie: "Cap de familie" },
      },
    };
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const summary = await importBackup(empty, parsed.backup, "replace", { families: parseFamiliesJson(json) });
    expect(summary.familii).toBe(0);
    expect(await empty.db.family.count()).toBe(0);
    const persons = await empty.db.person.findMany({ select: { familyId: true, familieVeche: true } });
    expect(persons.every((p) => p.familyId === null && p.familieVeche === "Rusu")).toBe(true);

    // On request: a family from the text, whose head is never the child marked "Cap de familie".
    await importBackup(empty, parsed.backup, "replace", { families: parseFamiliesJson(json), textFamilies: true });
    const fam = await empty.db.family.findFirstOrThrow({ include: { head: true } });
    expect(fam.head?.prenume).not.toBe("Ana");
  });
});
