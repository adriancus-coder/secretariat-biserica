import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, actionCtx: async () => current, requireCtx: async () => current }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/step-up", () => ({ hasStepUp: async () => true }));

const { fitPagesAction, pageInfoAction, restoreLayoutAction } = await import("@/server/actions/fit-pages");
const { DEFAULT_LAYOUT, PAGE_LAYOUT_FIELDS } = await import("@/lib/page-layout");

/** FIT-TO-PAGE on the database: the minutes' and the documents' layout pages. */
describe.skipIf(!hasTestDb)("fit to fewer pages", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let churchId: string;
  const point = (i: number) => `Punctul ${i + 1}: ${"se discută bugetul, programul și lucrările bisericii ".repeat(7).trim()}.`;
  const form = (tinta: string, id: string, layout = DEFAULT_LAYOUT) => {
    const fd = new FormData();
    fd.set("tinta", tinta);
    fd.set("id", id);
    for (const k of PAGE_LAYOUT_FIELDS) fd.set(k, k === "letterhead" ? (layout.letterhead ? "on" : "") : String(layout[k]));
    return fd;
  };
  let nr = 0;
  const meeting = (n: number, locked = false) =>
    prisma.meeting.create({
      data: {
        churchId,
        tip: "Comitet",
        nr: ++nr,
        anRegistru: 2026,
        data: new Date("2026-10-29T00:00:00Z"),
        locked,
        puncte: Array.from({ length: n }, (_, i) => point(i)),
        voturi: Array.from({ length: n }, () => ({ pentru: 7, contra: 0, abtineri: 0, secret: false })),
        formulaIncheiere: "Ședința s-a încheiat la ora 20.",
      },
    });

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Biserica Penticostală Maranata Stavanger", slug: "maranata", pastor: "Daniel Mureșan", secretar: "Ioana Pop" } })).id;
    const u = await prisma.user.create({ data: { churchId, email: "s@x.ro", name: "Secretar", passwordHash: "x", role: "SECRETAR" } });
    ctx = { user: { id: u.id, name: "Secretar", email: "s@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId, churchName: "M" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    current = ctx;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  /** A minutes taking 4 pages in the usual layout. */
  async function fourPages(locked = false) {
    for (let n = 6; n <= 30; n++) {
      const m = await meeting(n, locked);
      if ((await pageInfoAction(form("pv", m.id))).pages === 4) return m;
      await prisma.meeting.delete({ where: { id: m.id } });
    }
    throw new Error("no 4-page minutes");
  }

  it("4 → 3 pages: saved as the minutes' own layout (audited), then „Revino la așezarea obișnuită”", async () => {
    const m = await fourPages();
    const defaultBefore = (await prisma.church.findUniqueOrThrow({ where: { id: churchId } })).pvLayout;
    const r = await fitPagesAction(form("pv", m.id));
    expect(r).toMatchObject({ ok: true, from: 4, to: 3, saved: true, message: "Rearanjat: 4 → 3 pagini" });
    const saved = await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } });
    expect(saved.layout).toMatchObject({ ...r.layout });
    expect((await pageInfoAction(form("pv", m.id, r.layout))).pages).toBe(3);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: m.id }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(audit.changes)).toContain("asezare");
    // The church's default is not touched.
    expect((await prisma.church.findUniqueOrThrow({ where: { id: churchId } })).pvLayout).toEqual(defaultBefore);
    // Back to the usual layout (the minutes had none of its own).
    const back = await restoreLayoutAction(form("pv", m.id, r.layout));
    expect(back.ok).toBe(true);
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).layout).toBeNull();
  });

  it("a closed minutes: the fitted layout is returned for the download, never saved", async () => {
    const m = await fourPages(true);
    const r = await fitPagesAction(form("pv", m.id));
    expect(r).toMatchObject({ ok: true, from: 4, to: 3, saved: false });
    expect(r.message).toContain("Procesul-verbal este închis");
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).layout).toBeNull();
    expect((await restoreLayoutAction(form("pv", m.id))).ok).toBeFalsy();
  });

  it("a short minutes: already on one page; a document approved by the pastor is not changed", async () => {
    const short = await meeting(1);
    expect(await fitPagesAction(form("pv", short.id))).toMatchObject({ ok: false, message: "Documentul are deja o singură pagină." });
    await prisma.user.create({ data: { churchId, email: "p@x.ro", name: "Pastor", passwordHash: "x", role: "VIZUALIZARE", isPastor: true } });
    const text = Array.from({ length: 120 }, (_, i) => `Rândul ${i + 1} al scrisorii despre activitatea bisericii în anul acesta.`).join("\n");
    const doc = await prisma.document.create({ data: { churchId, tip: "scrisoare", nr: 1, anRegistru: 2026, data: new Date("2026-10-29T00:00:00Z"), text, stare: "APROBAT" } });
    const r = await fitPagesAction(form("document", doc.id));
    expect(r).toMatchObject({ ok: true, saved: false });
    expect(r.message).toContain("aprobat de pastor");
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).layout).toBeNull();
    // A draft is saved.
    await prisma.document.update({ where: { id: doc.id }, data: { stare: "CIORNA" } });
    const draft = await fitPagesAction(form("document", doc.id));
    expect(draft).toMatchObject({ ok: true, saved: true });
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).layout).toMatchObject({ ...draft.layout });
  });
});
