import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", async () => {
  const { permissions } = await import("@/lib/permissions");
  return {
    ActionError: class ActionError extends Error {},
    actionCtx: async () => current,
    requireCtx: async (p: "read" = "read") => {
      // The real requireCtx calls forbidden() (HTTP 403, checked in the smoke test); here a marker.
      if (!permissions[p](current.user)) throw new Error("forbidden 403");
      return current;
    },
  };
});
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { addAssetPhotoAction, deleteAssetPhotoAction, makeMainAssetPhotoAction } = await import("@/server/actions/asset-photos");
const { GET } = await import("@/app/api/patrimoniu/poze/[id]/route");
const { buildExportJson, parseImportJson } = await import("@/server/backup-json");
const { importBackup } = await import("@/server/backup");

/** PATRIMONY-PHOTOS on the database: limits, order, serving with permissions, backup. */
describe.skipIf(!hasTestDb)("photos of the goods", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let other: Ctx;
  let prayer: Ctx;
  let asset = "";
  const jpeg = (color: string) => sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).jpeg().toBuffer();
  const form = async (color: string) => {
    const f = new FormData();
    f.set("poza", new File([new Uint8Array(await jpeg(color))], "poza.jpg", { type: "image/jpeg" }));
    return f;
  };
  const get = (id: string, v = "thumb", headers: Record<string, string> = {}) =>
    GET(new Request(`http://localhost/api/patrimoniu/poze/${id}?v=${v}`, { headers }), { params: Promise.resolve({ id }) } as never);
  const photos = () => prisma.assetPhoto.findMany({ where: { assetId: asset }, orderBy: { ordine: "asc" }, select: { id: true, ordine: true } });

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [ca, cb] = await Promise.all(["foto-a", "foto-b"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const mk = async (churchId: string, email: string, role: "SECRETAR" | "RUGACIUNE") => {
      const u = await prisma.user.create({ data: { churchId, email, name: email, passwordHash: "x", role } });
      return { user: { id: u.id, name: u.name, email, role, isPastor: false, accesDisciplina: false, churchId, churchName: "X" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    };
    ctx = await mk(ca.id, "s@x.ro", "SECRETAR");
    prayer = await mk(ca.id, "r@x.ro", "RUGACIUNE");
    other = await mk(cb.id, "o@x.ro", "SECRETAR");
    asset = (await prisma.asset.create({ data: { churchId: ca.id, nrInventar: 1, denumire: "Pian", categorie: "Instrumente muzicale" } })).id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("up to 4 photos per good; the 5th is refused; each addition audited without the content", async () => {
    current = ctx;
    for (const c of ["#a33", "#3a3", "#33a", "#aa3"]) expect((await addAssetPhotoAction(asset, await form(c))).ok).toBe(true);
    expect((await addAssetPhotoAction(asset, await form("#3aa"))).message).toBe("Un bun poate avea cel mult 4 poze. Ștergeți una înainte.");
    expect((await photos()).map((p) => p.ordine)).toEqual([0, 1, 2, 3]);
    const audit = await prisma.auditLog.findMany({ where: { entity: "ASSET", entityId: asset } });
    expect(audit).toHaveLength(4);
    expect(JSON.stringify(audit[0].changes)).toBe(JSON.stringify({ observatie: "poză adăugată la bunul nr. 1" }));
  });

  it("„Fă poză principală” moves it first; deleting renumbers", async () => {
    current = ctx;
    const [a, b, c, d] = await photos();
    await makeMainAssetPhotoAction(c.id);
    expect((await photos()).map((p) => p.id)).toEqual([c.id, a.id, b.id, d.id]);
    await deleteAssetPhotoAction(c.id);
    expect((await photos()).map((p) => [p.id, p.ordine])).toEqual([
      [a.id, 0],
      [b.id, 1],
      [d.id, 2],
    ]);
  });

  it("the church's quota: 100 MB for the photos of all goods", async () => {
    current = ctx;
    const second = (await prisma.asset.create({ data: { churchId: ctx.user.churchId, nrInventar: 2, denumire: "Mixer", categorie: "Altele" } })).id;
    await prisma.assetPhoto.create({ data: { churchId: ctx.user.churchId, assetId: second, width: 1, height: 1, bytes: 100 * 1024 * 1024 - 10, data: new Uint8Array([1]), thumb: new Uint8Array([1]) } });
    expect((await addAssetPhotoAction(second, await form("#000"))).message).toMatch(/^Pozele patrimoniului au ajuns la 100 MB din 100 MB\./);
    await prisma.assetPhoto.deleteMany({ where: { assetId: second } });
  });

  it("served with the page's permissions: JPEG, private cache, ETag; Rugăciune 403; another church 404", async () => {
    current = ctx;
    const [p] = await photos();
    const r = await get(p.id);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toBe("private, max-age=86400");
    expect((await sharp(Buffer.from(await r.arrayBuffer())).metadata()).width).toBe(400);
    const full = await get(p.id, "full");
    expect((await sharp(Buffer.from(await full.arrayBuffer())).metadata()).width).toBe(640);
    expect((await get(p.id, "thumb", { "if-none-match": r.headers.get("etag")! })).status).toBe(304);
    current = prayer;
    await expect(get(p.id)).rejects.toThrow("forbidden 403");
    current = other;
    expect((await get(p.id)).status).toBe(404);
  });

  it("the backup carries the photos only when asked, and imports them again (re-encoded)", async () => {
    current = ctx;
    expect((await buildExportJson(ctx)).data.patrimoniuPoze).toBeUndefined();
    const parsed = parseImportJson(JSON.parse(JSON.stringify((await buildExportJson(ctx, { photos: true })).data)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.extras.assetPhotos).toHaveLength(3);
    await importBackup(other, parsed.backup, "merge", parsed.extras);
    const imported = await other.db.assetPhoto.findMany({ orderBy: { ordine: "asc" } });
    expect(imported.map((p) => p.ordine)).toEqual([0, 1, 2]);
    expect((await sharp(Buffer.from(imported[0].thumb)).metadata()).width).toBe(400);
  });
});
