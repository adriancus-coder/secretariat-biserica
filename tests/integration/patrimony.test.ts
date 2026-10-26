import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({
  ActionError: class ActionError extends Error {},
  actionCtx: async () => current,
}));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<object>()), redirect: () => {} }));

const { saveAssetAction, retireAssetAction } = await import("@/server/actions/assets");
const { generateReportText } = await import("@/server/queries/stats");
const { anonymizePerson } = await import("@/server/anonymize");
const { buildExportJson, parseImportJson } = await import("@/server/backup-json");
const { importBackup } = await import("@/server/backup");

/** PATRIMONY (Statut art. 43 alin. 7; art. 54–55) on the database. */
describe.skipIf(!hasTestDb)("inventory of goods", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let other: Ctx;
  let person = "";
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const base = { denumire: "Pian Yamaha", categorie: "Instrumente muzicale", provenienta: "DONATIE", stare: "BUN", dataIntrarii: "2024-05-01", valoare: "45000", cantitate: "1" };

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [ca, cb] = await Promise.all(["pat-a", "pat-b"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const [ua, ub] = await Promise.all([ca, cb].map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `p${i}@x.ro`, name: "Secretar", passwordHash: "x", role: "SECRETAR" } })));
    ctx = { user: { id: ua.id, name: "Secretar", email: "p0@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId: ca.id, churchName: "A" }, db: scopeToChurch(prisma, ca.id) } as Ctx;
    other = { user: { id: ub.id, name: "Admin", email: "p1@x.ro", role: "ADMIN", isPastor: false, accesDisciplina: false, churchId: cb.id, churchName: "B" }, db: scopeToChurch(prisma, cb.id) } as Ctx;
    person = (await prisma.person.create({ data: { churchId: ca.id, nume: "Lungu", prenume: "Petru", sortKey: "lungu petru" } })).id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("new goods get the next inventory number; a taken number is refused; audited", async () => {
    current = ctx;
    await saveAssetAction(null, {}, form({ ...base, responsabilId: person }));
    await saveAssetAction(null, {}, form({ ...base, denumire: "Mixer", categorie: "Sonorizare și video", valoare: "" }));
    const rows = await ctx.db.asset.findMany({ orderBy: { nrInventar: "asc" } });
    expect(rows.map((r) => [r.nrInventar, r.denumire, r.valoare])).toEqual([
      [1, "Pian Yamaha", 45000],
      [2, "Mixer", null],
    ]);
    expect((await saveAssetAction(null, {}, form({ ...base, nrInventar: "2" }))).errors?.nrInventar).toBe("Numărul de inventar 2 este deja folosit.");
    expect(await prisma.auditLog.count({ where: { entity: "ASSET" } })).toBe(2);
  });

  it("„Scoate din uz” keeps the good with the date and reason; it is no longer edited; the report counts the goods in use", async () => {
    current = ctx;
    const mixer = await ctx.db.asset.findFirstOrThrow({ where: { denumire: "Mixer" } });
    await retireAssetAction(mixer.id, {}, form({ dataIesirii: "2026-03-01", motivIesirii: "Defect" }));
    const after = await ctx.db.asset.findUniqueOrThrow({ where: { id: mixer.id } });
    expect([after.stare, after.motivIesirii]).toEqual(["SCOS_DIN_UZ", "Defect"]);
    expect((await saveAssetAction(mixer.id, {}, form(base))).message).toBe("Bunul a fost scos din uz și nu se mai modifică.");
    expect((await generateReportText(ctx, 2026)).split("\n").at(-1)).toBe("Patrimoniu: 1 bun în evidență.");
    // In 2025 the mixer was still in use.
    expect((await generateReportText(ctx, 2025)).split("\n").at(-1)).toBe("Patrimoniu: 2 bunuri în evidență.");
  });

  it("the backup carries the inventory into another church, the responsible person linked", async () => {
    const parsed = parseImportJson(JSON.parse(JSON.stringify((await buildExportJson(ctx)).data)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(other, parsed.backup, "merge", parsed.extras);
    const goods = await other.db.asset.findMany({ orderBy: { nrInventar: "asc" }, include: { responsabilP: true } });
    expect(goods.map((g) => [g.nrInventar, g.stare, g.responsabilP?.prenume ?? null])).toEqual([
      [1, "BUN", "Petru"],
      [2, "SCOS_DIN_UZ", null],
    ]);
  });

  it("anonymising unlinks the responsible person", async () => {
    current = ctx;
    await anonymizePerson(ctx, person);
    expect((await ctx.db.asset.findFirstOrThrow({ where: { denumire: "Pian Yamaha" } })).responsabilId).toBeNull();
  });
});
