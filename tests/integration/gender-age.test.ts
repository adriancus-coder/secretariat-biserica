import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, requireCtx: async () => current, actionCtx: async () => current }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("@/server/step-up", () => ({ sensitiveCheck: async () => "ok", stepUpMethod: async () => "password", hasStepUp: async () => true }));
vi.mock("@/server/export-grant", () => ({ EXPORT_GRANT_COOKIE: "g", grantCookieHeader: () => "g=1", hasGrant: () => true }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "x" }) }), headers: async () => new Headers() }));

const { filteredSelectionIds } = await import("@/server/queries/categories");
const { exportCountAction } = await import("@/server/actions/person-export");
const { genderAgeRows, parseListSpec, personOrder } = await import("@/server/queries/persons");
const { POST } = await import("@/app/api/persoane/export/route");

/** GENDER-AGE-FILTERS on the database: the lists, the navigation and the export follow the filters. */
describe.skipIf(!hasTestDb)("gender and age filters", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let churchId: string;
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "B", slug: "b-ga" } })).id;
    const u = await prisma.user.create({ data: { churchId, email: "s@x.ro", name: "S", passwordHash: "x", role: "SECRETAR" } });
    current = { user: { id: u.id, name: "S", email: "s@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId, churchName: "B" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    const p = (prenume: string, gen: "M" | "F" | null, born: string | null, statut = "APARTINATOR") =>
      prisma.person.create({ data: { churchId, nume: "Pop", prenume, gen, statut: statut as never, dataNasterii: born ? day(born) : null, sortKey: `pop ${prenume.toLowerCase()}` } });
    await p("Ana", "F", "2015-01-01");
    await p("Bia", "F", "2012-01-01");
    await p("Cora", "F", "1980-01-01");
    await p("Dan", "M", "2014-01-01");
    await p("Eli", "M", "1975-01-01", "MEMBRU");
    await p("Fără", null, "2016-01-01");
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("a category × gender × age gives the right persons; the sums hold", async () => {
    const sel = { keys: ["apartinatori"], functie: "" };
    expect((await filteredSelectionIds(current, sel, undefined, { gen: "F", varsta: "minori" })).length).toBe(2);
    expect((await filteredSelectionIds(current, sel, undefined, { gen: "toti", varsta: "toti" })).length).toBe(5);
    const parts = await Promise.all((["M", "F", "fara"] as const).map((gen) => filteredSelectionIds(current, sel, undefined, { gen, varsta: "toti" })));
    expect(parts.reduce((s, l) => s + l.length, 0)).toBe(5);
    // The status filter's list (no category) too.
    expect((await genderAgeRows(current, { filter: "toate", q: "" })).length).toBe(6);
  });

  it("previous / next follow the filtered list (the URL is kept in `din`)", async () => {
    const ids = await personOrder(current, parseListSpec("categorie=toti&gen=F&varsta=minori"), []);
    const names = (await prisma.person.findMany({ where: { id: { in: ids } }, select: { prenume: true } })).map((x) => x.prenume).sort();
    expect(names).toEqual(["Ana", "Bia"]);
  });

  it("the export's count and its Excel rows follow the filters", async () => {
    const form = () => {
      const f = new FormData();
      for (const [k, v] of [["categorie", "toti"], ["coloane", "nume"], ["coloane", "prenume"], ["format", "xlsx"], ["gen", "F"], ["varsta", "minori"]]) f.append(k, v);
      return f;
    };
    expect(await exportCountAction(form())).toEqual({ count: 2 });
    const res = await POST(new Request("http://localhost/api/persoane/export", { method: "POST", body: form() }));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const ws = wb.worksheets[0];
    const values = ws.getSheetValues().filter(Boolean).map((r) => (Array.isArray(r) ? r.filter(Boolean).join(" ") : ""));
    expect(values.some((v) => v.includes("femei · minori"))).toBe(true);
    expect(values.filter((v) => /^Pop /.test(v) || /Pop$/.test(v.split(" ")[0] ?? "")).length).toBe(2);
  });
});
