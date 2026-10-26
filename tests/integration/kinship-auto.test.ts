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
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<object>()), redirect: () => {} }));

const { moveToFamilyAction } = await import("@/server/actions/families");
const { runFirstKinshipCheck } = await import("@/server/kinship-sync");

/** KINSHIP-AUTO on the database. */
describe.skipIf(!hasTestDb)("kinship: automatic check and siblings", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let churchId: string;
  const id: Record<string, string> = {};

  const parentsOf = async (childId: string) =>
    (await prisma.personParent.findMany({ where: { childId }, select: { parentId: true, externalParent: { select: { nume: true } }, source: true } }))
      .map((l) => `${l.parentId ? Object.keys(id).find((k) => id[k] === l.parentId) : `x:${l.externalParent!.nume}`}/${l.source}`)
      .sort();

  beforeAll(async () => {
    await resetDatabase(prisma);
    const church = await prisma.church.create({ data: { nume: "auto", slug: "auto" } });
    churchId = church.id;
    const u = await prisma.user.create({ data: { churchId, email: "a@x.ro", name: "Admin", passwordHash: "x", role: "ADMIN" } });
    ctx = { user: { id: u.id, name: "Admin", email: "a@x.ro", role: "ADMIN", isPastor: false, churchId, churchName: "A" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    const family = async (key: string, members: [string, string, Record<string, unknown>][]) => {
      const f = await prisma.family.create({ data: { churchId, nume: `Fam. ${members[0][1]} ${members[0][0]}` } });
      for (const [nume, prenume, extra] of members) id[prenume] = (await prisma.person.create({ data: { churchId, nume, prenume, sortKey: `${nume} ${prenume}`, familyId: f.id, ...extra } as never })).id;
      await prisma.family.update({ where: { id: f.id }, data: { headId: id[members[0][1]] } });
      id[key] = f.id;
    };
    // Dumitru's family with a minor daughter, his married son Felix heading his own family.
    await family("fD", [
      ["Ciobanu", "Dumitru", { rudenie: "Cap de familie", gen: "M", dataNasterii: new Date("1965-01-01") }],
      ["Ciobanu", "Iulia", { rudenie: "Soție", gen: "F", dataNasterii: new Date("1968-01-01") }],
      ["Ciobanu", "Felix", { rudenie: "Fiu", gen: "M", dataNasterii: new Date("1990-01-01") }],
      ["Ciobanu", "Thea", { rudenie: "Fiică", gen: "F", dataNasterii: new Date("2012-01-01") }],
    ]);
    // Two heads of family with no parents in the register and no parents' names, each with a child.
    await family("fI", [
      ["Popa", "Ion", { rudenie: "Cap de familie", gen: "M" }],
      ["Popa", "Estera", { rudenie: "Fiică", gen: "F" }],
    ]);
    await family("fV", [
      ["Popa", "Vasile", { rudenie: "Cap de familie", gen: "M" }],
      ["Popa", "Lidia", { rudenie: "Fiică", gen: "F" }],
    ]);
    id.Mihai = (await prisma.person.create({ data: { churchId, nume: "Popa", prenume: "Mihai", sortKey: "Popa Mihai", gen: "M" } })).id;
    id.Pavel = (await prisma.person.create({ data: { churchId, nume: "Rusu", prenume: "Pavel", sortKey: "Rusu Pavel", gen: "M", numeTata: "Rusu Petru" } })).id;
    id.Radu = (await prisma.person.create({ data: { churchId, nume: "Rusu", prenume: "Radu", sortKey: "Rusu Radu", gen: "M", numeTata: "Rusu Pantelimon" } })).id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("the first run: once per church, in the background, marked and audited with counts only", async () => {
    await runFirstKinshipCheck(ctx.user);
    const church = await prisma.church.findUniqueOrThrow({ where: { id: churchId } });
    expect(church.kinshipCheckedAt).not.toBeNull();
    expect(await parentsOf(id.Thea)).toEqual(["Dumitru/FAMILIE", "Iulia/FAMILIE"]);
    expect(await parentsOf(id.Felix)).toEqual(["Dumitru/FAMILIE", "Iulia/FAMILIE"]);
    const audit = await prisma.auditLog.findMany({ where: { churchId, entityLabel: "Legături de rudenie" } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].changes)).toContain("prima verificare automată a registrului: 0 legături șterse, 6 adăugate din familii, 0 de verificat");
    expect(JSON.stringify(audit[0].changes)).not.toContain("Ciobanu");
    // Never twice (the church is marked; a second page load does nothing).
    await prisma.church.update({ where: { id: churchId }, data: { kinshipCheckedAt: null } });
    await runFirstKinshipCheck(ctx.user);
    expect(await prisma.auditLog.count({ where: { churchId, entityLabel: "Legături de rudenie" } })).toBe(1);
    await prisma.church.update({ where: { id: churchId }, data: { kinshipCheckedAt: church.kinshipCheckedAt } });
  });

  it("a child moved to another family: the links follow without the button", async () => {
    current = ctx;
    const form = new FormData();
    form.set("tinta", id.fI);
    await moveToFamilyAction(id.Thea, {}, form);
    // Thea is still "Fiică": in Ion's family she is his daughter now; Dumitru's links from the family went.
    expect(await parentsOf(id.Thea)).toEqual(["Ion/FAMILIE"]);
    // Felix, an adult son with his own family elsewhere, keeps his parents.
    expect(await parentsOf(id.Felix)).toEqual(["Dumitru/FAMILIE", "Iulia/FAMILIE"]);
    // Back home: the links are made again.
    form.set("tinta", id.fD);
    await moveToFamilyAction(id.Thea, {}, form);
    expect(await parentsOf(id.Thea)).toEqual(["Dumitru/FAMILIE", "Iulia/FAMILIE"]);
  });
});
