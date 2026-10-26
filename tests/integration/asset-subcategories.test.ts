import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", async () => {
  const { permissions } = await import("@/lib/permissions");
  return {
    ActionError: class ActionError extends Error {},
    actionCtx: async (p: "read" = "read") => {
      if (!permissions[p](current.user)) throw new Error("Nu aveți dreptul.");
      return current;
    },
  };
});
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<object>()), redirect: () => {} }));

const { saveAssetAction } = await import("@/server/actions/assets");
const { deleteSubcategoryAction, moveSubcategoryAction, saveSubcategoryAction } = await import("@/server/actions/asset-subcategories");
const { buildExportJson, parseImportJson } = await import("@/server/backup-json");
const { importBackup } = await import("@/server/backup");

/** The data part of the migration (the DO block), run again. */
const sql = readFileSync("prisma/migrations/20261120100000_asset_subcategories/migration.sql", "utf8");
const defaultsBlock = sql.slice(sql.indexOf("DO $$"));

/** PATRIMONY-SUBCATEGORIES on the database. */
describe.skipIf(!hasTestDb)("subcategories of the goods", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let admin: Ctx;
  let secretary: Ctx;
  let churchId: string;
  let renamedChurch: string;
  const sub = async (categorie: string, nume: string) => (await prisma.assetSubcategory.findFirstOrThrow({ where: { churchId, categorie, nume } })).id;
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ denumire: "Shure SM58", categorie: "Sonorizare și video", cantitate: "2", provenienta: "CUMPARARE", stare: "BUN", ...fields })) f.set(k, v);
    return f;
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Sub", slug: "sub" } })).id;
    // A church that renamed „Mobilier” and kept „Bucătărie”.
    renamedChurch = (await prisma.church.create({ data: { nume: "Alta", slug: "alta", categoriiPatrimoniu: ["Mobilă", "Bucătărie"] } })).id;
    const mk = async (email: string, role: "ADMIN" | "SECRETAR") => {
      const u = await prisma.user.create({ data: { churchId, email, name: email, passwordHash: "x", role } });
      return { user: { id: u.id, name: u.name, email, role, isPastor: false, accesDisciplina: false, churchId, churchName: "Sub" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    };
    admin = await mk("admin@x.ro", "ADMIN");
    secretary = await mk("secretar@x.ro", "SECRETAR");
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("the migration's defaults: only under default-named categories, and only once", async () => {
    await prisma.$executeRawUnsafe(defaultsBlock);
    expect(await prisma.assetSubcategory.count({ where: { churchId } })).toBe(26);
    expect((await prisma.assetSubcategory.findMany({ where: { churchId: renamedChurch }, orderBy: { ordine: "asc" } })).map((s) => `${s.categorie}/${s.nume}`)).toEqual([
      "Bucătărie/Electrocasnice",
      "Bucătărie/Veselă și tacâmuri",
      "Bucătărie/Mobilier de bucătărie",
    ]);
    await prisma.$executeRawUnsafe(defaultsBlock);
    expect(await prisma.assetSubcategory.count({ where: { churchId } })).toBe(26);
    expect(await prisma.assetSubcategory.count({ where: { churchId: renamedChurch } })).toBe(3);
    expect(await prisma.assetSubcategory.count({ where: { churchId, categorie: "Altele" } })).toBe(0);
  });

  it("a good takes a subcategory of its own category; another category's is refused; changing the category clears it", async () => {
    current = secretary;
    const mic = await sub("Sonorizare și video", "Microfoane");
    await saveAssetAction(null, {}, form({ subcategoryId: mic }));
    const good = await prisma.asset.findFirstOrThrow({ where: { churchId, denumire: "Shure SM58" } });
    expect(good.subcategoryId).toBe(mic);
    const refused = await saveAssetAction(null, {}, form({ denumire: "Masă", categorie: "Mobilier", subcategoryId: mic }));
    expect(refused.errors?.subcategoryId).toBe("Subcategoria nu aparține categoriei alese.");
    expect(await prisma.asset.count({ where: { churchId, denumire: "Masă" } })).toBe(0);
    // A subcategory of another church is not found through ctx.db.
    const foreign = (await prisma.assetSubcategory.findFirstOrThrow({ where: { churchId: renamedChurch } })).id;
    expect((await saveAssetAction(null, {}, form({ categorie: "Bucătărie", subcategoryId: foreign }))).errors?.subcategoryId).toBe("Subcategoria nu mai există.");
    // Edited to another category with the old subcategory still sent: refused; without it, saved with none.
    expect((await saveAssetAction(good.id, {}, form({ categorie: "Echipamente IT", subcategoryId: mic }))).errors?.subcategoryId).toBeTruthy();
    await saveAssetAction(good.id, {}, form({ categorie: "Echipamente IT", subcategoryId: "" }));
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: good.id } })).toMatchObject({ categorie: "Echipamente IT", subcategoryId: null });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: good.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(audit.changes).toMatchObject({ subcategorie: ["Microfoane", null] });
    await saveAssetAction(good.id, {}, form({ subcategoryId: mic }));
  });

  it("Setări (admin only): add, rename, reorder; a used subcategory is not deleted until its goods are moved", async () => {
    current = secretary;
    expect((await saveSubcategoryAction(null, "Sonorizare și video", {}, form({ nume: "Pupitre" }))).ok).toBeFalsy();
    current = admin;
    expect((await saveSubcategoryAction(null, "Sonorizare și video", {}, form({ nume: "Pupitre" }))).ok).toBe(true);
    expect((await saveSubcategoryAction(null, "Sonorizare și video", {}, form({ nume: "pupitre" }))).errors?.nume).toBe("Există deja o subcategorie cu această denumire în categorie.");
    expect((await saveSubcategoryAction(null, "Nu există", {}, form({ nume: "X" }))).message).toBe("Categoria nu mai există în nomenclator.");
    const pup = await sub("Sonorizare și video", "Pupitre");
    await moveSubcategoryAction(pup, "up");
    const order = (await prisma.assetSubcategory.findMany({ where: { churchId, categorie: "Sonorizare și video" }, orderBy: { ordine: "asc" } })).map((s) => s.nume);
    expect(order.slice(-2)).toEqual(["Pupitre", "Cabluri și accesorii"]);
    await saveSubcategoryAction(pup, null, {}, form({ nume: "Pupitre și stative" }));

    const mic = await sub("Sonorizare și video", "Microfoane");
    const refused = await deleteSubcategoryAction(mic, {}, new FormData());
    expect(refused.errors?.mutaLa).toBe("Folosită la 1 bun. Alegeți întâi unde se mută bunurile.");
    expect(await prisma.assetSubcategory.findUnique({ where: { id: mic } })).not.toBeNull();
    // Only a subcategory of the same category.
    const it = await sub("Echipamente IT", "Rețea");
    expect((await deleteSubcategoryAction(mic, {}, form({ mutaLa: it }))).errors?.mutaLa).toBe("Alegeți o altă subcategorie din aceeași categorie.");
    const target = await sub("Sonorizare și video", "Pupitre și stative");
    const ok = await deleteSubcategoryAction(mic, {}, form({ mutaLa: target }));
    expect(ok.message).toBe("Subcategoria a fost ștearsă; 1 bun a fost mutat.");
    expect(await prisma.assetSubcategory.findUnique({ where: { id: mic } })).toBeNull();
    expect((await prisma.asset.findFirstOrThrow({ where: { churchId, denumire: "Shure SM58" } })).subcategoryId).toBe(target);
    expect(await prisma.auditLog.count({ where: { churchId, entity: "SETTINGS", action: "DELETE", entityLabel: { contains: "Microfoane" } } })).toBe(1);
    // An unused one is deleted at once.
    expect((await deleteSubcategoryAction(await sub("Mobilier", "Amvon"), {}, new FormData())).ok).toBe(true);
  });

  it("backup: the subcategories and each good's travel by name; an older file imports unchanged", async () => {
    current = admin;
    const json = (await buildExportJson(admin)).data;
    expect(json.subcategoriiPatrimoniu).toContainEqual({ categorie: "Sonorizare și video", nume: "Pupitre și stative", ordine: expect.any(Number) });
    expect((json.patrimoniu as { subcategorie: string }[])[0].subcategorie).toBe("Pupitre și stative");
    // Into an empty church: the subcategories are created and the good linked.
    const otherId = (await prisma.church.create({ data: { nume: "Nouă", slug: "noua" } })).id;
    const u = await prisma.user.create({ data: { churchId: otherId, email: "n@x.ro", name: "N", passwordHash: "x", role: "ADMIN" } });
    const other = { user: { ...admin.user, id: u.id, churchId: otherId }, db: scopeToChurch(prisma, otherId) } as Ctx;
    const parsed = parseImportJson(JSON.parse(JSON.stringify(json)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(other, parsed.backup, "merge", parsed.extras);
    const good = await prisma.asset.findFirstOrThrow({ where: { churchId: otherId }, include: { subcategory: true } });
    expect(good.subcategory?.nume).toBe("Pupitre și stative");
    expect(await prisma.assetSubcategory.count({ where: { churchId: otherId } })).toBe(await prisma.assetSubcategory.count({ where: { churchId } }));
    // An older file (no subcategories): the goods keep theirs, nothing else changes.
    const old = JSON.parse(JSON.stringify(json));
    delete old.subcategoriiPatrimoniu;
    for (const g of old.patrimoniu) delete g.subcategorie;
    const before = await prisma.assetSubcategory.count({ where: { churchId: otherId } });
    const p2 = parseImportJson(old);
    if (!p2.ok) throw new Error(p2.errors.join("; "));
    await importBackup(other, p2.backup, "merge", p2.extras);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: good.id } })).subcategoryId).toBe(good.subcategoryId);
    expect(await prisma.assetSubcategory.count({ where: { churchId: otherId } })).toBe(before);
  });
});
