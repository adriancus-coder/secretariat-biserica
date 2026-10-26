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

const { saveCorrespondenceAction } = await import("@/server/actions/correspondence");
const { saveDocumentAction } = await import("@/server/actions/documents");
const { loadRegister } = await import("@/server/queries/correspondence");
const { loadDataCopy } = await import("@/server/data-copy");
const { anonymizePerson } = await import("@/server/anonymize");
const { buildExportJson, parseImportJson } = await import("@/server/backup-json");
const { importBackup } = await import("@/server/backup");

/** CORRESPONDENCE-REGISTER (Statut art. 43 alin. 7) on the database. */
describe.skipIf(!hasTestDb)("correspondence register", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let other: Ctx;
  let person = "";
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const rows = () => prisma.correspondence.findMany({ where: { churchId: ctx.user.churchId }, orderBy: [{ an: "asc" }, { nr: "asc" }] });

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [ca, cb] = await Promise.all(["cor-a", "cor-b"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const [ua, ub] = await Promise.all([ca, cb].map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `c${i}@x.ro`, name: "Secretar", passwordHash: "x", role: "SECRETAR" } })));
    ctx = { user: { id: ua.id, name: "Secretar", email: "c0@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId: ca.id, churchName: "A" }, db: scopeToChurch(prisma, ca.id) } as Ctx;
    other = { user: { id: ub.id, name: "Secretar", email: "c1@x.ro", role: "ADMIN", isPastor: false, accesDisciplina: false, churchId: cb.id, churchName: "B" }, db: scopeToChurch(prisma, cb.id) } as Ctx;
    person = (await prisma.person.create({ data: { churchId: ca.id, nume: "Popescu", prenume: "Ionel", sortKey: "popescu ionel" } })).id;
    // A document already issued keeps its own number.
    await prisma.document.create({ data: { churchId: ca.id, tip: "adeverinta", nr: 7, anRegistru: 2026, data: new Date("2026-03-01"), text: "x", catre: "Primăria", stare: "APROBAT" } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("one sequence per year for entries and exits; a taken number is refused; the next year starts at 1", async () => {
    current = ctx;
    await saveCorrespondenceAction(null, {}, form({ directie: "INTRARE", data: "2026-04-01", dela: "Comunitatea Bergen", subiect: "Convocare conferință", personId: person }));
    await saveCorrespondenceAction(null, {}, form({ directie: "IESIRE", data: "2026-04-02", catre: "Biserica Betel", subiect: "Recomandare" }));
    expect((await rows()).map((r) => `${r.nr}/${r.an} ${r.directie}`)).toEqual(["1/2026 INTRARE", "2/2026 IESIRE"]);
    expect((await saveCorrespondenceAction(null, {}, form({ nr: "2", directie: "INTRARE", data: "2026-04-03", dela: "X", subiect: "Y" }))).errors?.nr).toBe("Numărul 2/2026 este deja folosit în registru.");
    await saveCorrespondenceAction(null, {}, form({ directie: "INTRARE", data: "2027-01-05", dela: "X", subiect: "Anul nou" }));
    expect((await rows()).at(-1)!.nr).toBe(1);
    // An entry needs its sender.
    expect((await saveCorrespondenceAction(null, {}, form({ directie: "INTRARE", data: "2026-04-03", subiect: "Y" }))).errors?.dela).toBe("Scrieți de la cine vine.");
  });

  it("„Răspunde”: a linked exit marks the entry answered; the documents of the app show as exits with their own number", async () => {
    current = ctx;
    const entry = (await rows())[0];
    await saveCorrespondenceAction(null, {}, form({ directie: "IESIRE", data: "2026-04-10", catre: entry.dela, subiect: "Răspuns: Convocare conferință", raspunsLaId: entry.id }));
    expect((await prisma.correspondence.findUniqueOrThrow({ where: { id: entry.id } })).rezolvare).toBe("Răspuns cu nr. 3/2026");
    const reg = await loadRegister(ctx, 2026);
    expect(reg.find((r) => r.docNr === "7/2026")).toMatchObject({ nr: null, directie: "IESIRE", party: "Primăria" });
    // A letter written from „Scrie scrisoarea de răspuns”: an exit with its own register number and the document's number.
    const second = await prisma.correspondence.create({ data: { churchId: ctx.user.churchId, nr: 9, an: 2026, data: new Date("2026-05-01"), directie: "INTRARE", dela: "Primăria", subiect: "Cerere" } });
    await saveDocumentAction(null, {}, form({ tip: "scrisoare", data: "2026-05-02", catre: "Primăria", titlu: "Răspuns la cerere", text: "Text", raspunsLa: second.id }));
    const exit = await prisma.correspondence.findFirstOrThrow({ where: { raspunsLaId: second.id } });
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: exit.documentId! } });
    expect([exit.nr, exit.directie, doc.nr]).toEqual([10, "IESIRE", 8]);
    expect((await prisma.correspondence.findUniqueOrThrow({ where: { id: second.id } })).rezolvare).toBe("Răspuns cu documentul nr. 8/2026");
    expect((await loadRegister(ctx, 2026)).filter((r) => r.documentId === doc.id)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entity: "CORRESPONDENCE" } })).toBeGreaterThan(4);
  });

  it("the art. 15 copy lists the person's rows; the backup carries the register into another church", async () => {
    const copy = await loadDataCopy(ctx, person, false);
    const section = copy!.sectiuni.find((x) => x.titlu.startsWith("Corespondență"));
    expect(section?.tabel?.randuri).toEqual([["1/2026", "01.04.2026", "Intrare", "Convocare conferință"]]);
    const parsed = parseImportJson(JSON.parse(JSON.stringify((await buildExportJson(ctx)).data)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(other, parsed.backup, "merge", parsed.extras);
    const imported = await other.db.correspondence.findMany({ orderBy: [{ an: "asc" }, { nr: "asc" }], include: { raspunsLa: true } });
    expect(imported.length).toBe((await rows()).length);
    expect(imported.find((r) => r.nr === 3)?.raspunsLa?.subiect).toBe("Convocare conferință");
  });

  it("anonymising unlinks the person and replaces the name only in the rows linked to them", async () => {
    current = ctx;
    await prisma.correspondence.create({ data: { churchId: ctx.user.churchId, nr: 20, an: 2026, data: new Date("2026-06-01"), directie: "INTRARE", dela: "Popescu Ionel", subiect: "Scrisoare", personId: person } });
    await prisma.correspondence.create({ data: { churchId: ctx.user.churchId, nr: 21, an: 2026, data: new Date("2026-06-01"), directie: "INTRARE", dela: "Popescu Ionel (altă persoană)", subiect: "Altceva" } });
    await anonymizePerson(ctx, person);
    const after = await prisma.correspondence.findMany({ where: { nr: { in: [20, 21] }, churchId: ctx.user.churchId }, orderBy: { nr: "asc" } });
    expect(after.map((r) => [r.dela, r.personId])).toEqual([
      ["Persoană ștearsă", null],
      ["Popescu Ionel (altă persoană)", null],
    ]);
  });
});
