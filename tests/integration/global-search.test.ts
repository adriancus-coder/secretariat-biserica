import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, actionCtx: async () => current }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));

const { searchData, searchPageGroup } = await import("@/server/global-search");
const { globalSearchAction } = await import("@/server/actions/search");

/** GLOBAL-SEARCH on the database: one church, the role's permissions, never discipline or pastoral notes. */
describe.skipIf(!hasTestDb)("global search", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let admin: Ctx;
  let other: Ctx;
  let prayer: Ctx;
  const titles = (groups: { key: string; items: { title: string }[] }[], key: string) => groups.find((g) => g.key === key)?.items.map((i) => i.title) ?? [];

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [a, b] = await Promise.all(["cauta-a", "cauta-b"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const mk = async (churchId: string, email: string, role: "ADMIN" | "RUGACIUNE", extra = {}) => {
      const u = await prisma.user.create({ data: { churchId, email, name: email, passwordHash: "x", role } });
      return { user: { id: u.id, name: email, email, role, isPastor: true, accesDisciplina: true, churchId, churchName: "X", ...extra }, db: scopeToChurch(prisma, churchId) } as Ctx;
    };
    admin = await mk(a.id, "a@x.ro", "ADMIN");
    other = await mk(b.id, "b@x.ro", "ADMIN");
    prayer = await mk(a.id, "r@x.ro", "RUGACIUNE", { isPastor: false, accesDisciplina: false });
    const ion = await prisma.person.create({ data: { churchId: a.id, nume: "Știrbu", prenume: "Ionuț", sortKey: "stirbu ionut", searchText: "stirbu ionut 4791234" } });
    await prisma.personAlias.create({ data: { churchId: a.id, personId: ion.id, alias: "ionica stirbu" } });
    await prisma.person.create({ data: { churchId: b.id, nume: "Știrbu", prenume: "Petru", sortKey: "stirbu petru", searchText: "stirbu petru" } });
    const sub = await prisma.assetSubcategory.create({ data: { churchId: a.id, categorie: "Sonorizare și video", nume: "Microfoane" } });
    await prisma.asset.create({ data: { churchId: a.id, nrInventar: 7, denumire: "Shure SM58", categorie: "Sonorizare și video", subcategoryId: sub.id } });
    await prisma.asset.create({ data: { churchId: b.id, nrInventar: 7, denumire: "Microfon Behringer", categorie: "Sonorizare și video" } });
    await prisma.meeting.create({ data: { churchId: a.id, tip: "Ședință de comitet", titlu: "Planificare", data: new Date("2026-09-11T00:00:00Z"), puncte: ["Abaterea fratelui zzsecret"] } });
    await prisma.document.create({ data: { churchId: a.id, tip: "adeverinta", nr: 3, anRegistru: 2026, data: new Date("2026-02-01T00:00:00Z"), persoana: "Știrbu Ionuț", text: "zzsecret din text" } });
    // Never searched: discipline, pastoral notes, the minutes' text.
    await prisma.disciplinaryMeasure.create({ data: { churchId: a.id, personId: ion.id, forma: "SUSPENDARE", dataInceput: new Date("2026-03-01"), motiv: "zzsecret disciplina" } });
    await prisma.pastoralNote.create({ data: { churchId: a.id, personId: ion.id, textEnc: "zzsecret" } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("persons without diacritics, by alias, only of the user's church", async () => {
    const r = await searchData(admin, "stirbu", 5);
    expect(titles(r, "persoane")).toEqual(["Știrbu Ionuț"]);
    expect(titles(await searchData(admin, "ionica", 5), "persoane")).toEqual(["Știrbu Ionuț"]);
    expect(titles(await searchData(other, "stirbu", 5), "persoane")).toEqual(["Știrbu Petru"]);
  });

  it("goods by subcategory, meetings and documents by their short fields, never another church's", async () => {
    expect(titles(await searchData(admin, "microfoane", 5), "patrimoniu")).toEqual(["Nr. inv. 7 — Shure SM58"]);
    expect(titles(await searchData(admin, "behringer", 5), "patrimoniu")).toEqual([]);
    expect(titles(await searchData(admin, "sedinta comitet", 5), "sedinte")).toEqual(["Planificare"]);
    expect(titles(await searchData(admin, "adeverinta 3/2026", 5), "documente")).toEqual(["Nr. 3/2026 — Adeverință de membru"]);
  });

  it("never discipline, pastoral notes or the texts of minutes and documents (even with access)", async () => {
    expect(await searchData(admin, "zzsecret", 5)).toEqual([]);
    expect(searchPageGroup(admin, "zzsecret", 5)).toBeNull();
  });

  it("the Rugăciune role: its pages only, no data", async () => {
    expect(await searchData(prayer, "stirbu", 5)).toEqual([]);
    current = prayer;
    const r = await globalSearchAction("aspect");
    expect(r.groups.map((g) => g.key)).toEqual(["pagini"]);
    expect(r.groups[0].items.map((i) => i.title)).toEqual(["Aspect"]);
    expect((await globalSearchAction("stirbu")).groups).toEqual([]);
  });

  it("the action: groups with totals, at most 5, a limit per user, nothing in the log", async () => {
    current = admin;
    const r = await globalSearchAction("stirbu");
    expect(r.groups.map((g) => g.key)).toEqual(expect.arrayContaining(["persoane", "documente"]));
    expect(await prisma.auditLog.count({ where: { churchId: admin.user.churchId } })).toBe(0);
    current = other;
    let refused = 0;
    for (let i = 0; i < 61; i++) if ((await globalSearchAction("xx")).message) refused++;
    expect(refused).toBe(1);
  });
});
