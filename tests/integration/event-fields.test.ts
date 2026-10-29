import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, actionCtx: async () => current, requireCtx: async () => current }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<object>()), redirect: () => {} }));

const { saveEventAction } = await import("@/server/actions/events");
const { getEvent } = await import("@/server/queries/events");
const { visibleEventFields } = await import("@/lib/event-fields");

/** EVENT-FIELDS-BY-TYPE on the database: the place without „Alt loc”, an older event's hidden field. */
describe.skipIf(!hasTestDb)("event fields by type", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let churchId: string;
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ data: "2026-11-08", ...fields })) f.append(k, v);
    return f;
  };
  const byTitle = (titlu: string) => prisma.event.findFirstOrThrow({ where: { churchId, titlu } });

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Biserica", slug: "biserica" } })).id;
    const u = await prisma.user.create({ data: { churchId, email: "s@x.ro", name: "Secretar", passwordHash: "x", role: "SECRETAR" } });
    current = { user: { id: u.id, name: "Secretar", email: "s@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId, churchName: "B" }, db: scopeToChurch(prisma, churchId) } as Ctx;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("„Alt loc decât biserica” unticked saves the place empty; ticked keeps it", async () => {
    await saveEventAction(null, {}, form({ titlu: "Fără loc", tip: "Evanghelizare", loc: "Sala sporturilor" }));
    expect((await byTitle("Fără loc")).loc).toBe("");
    await saveEventAction(null, {}, form({ titlu: "Cu loc", tip: "Evanghelizare", altLoc: "on", loc: "Sala sporturilor" }));
    expect((await byTitle("Cu loc")).loc).toBe("Sala sporturilor");
  });

  it("an older blessing with „Invitat” keeps it, visible in the form and after a save", async () => {
    const old = await prisma.event.create({ data: { churchId, titlu: "Binecuvântare veche", tip: "Binecuvântare copil", data: new Date("2020-05-03T00:00:00Z"), invitat: "Pastor Ionescu" } });
    const e = (await getEvent(current, old.id))!;
    expect(visibleEventFields(e.tip, { ...e, contributii: e.contributii.length, persoane: e.persoane.length }).has("invitat")).toBe(true);
    // The form still sends the field (it is shown), so a save keeps it.
    const r = await saveEventAction(old.id, {}, form({ titlu: "Binecuvântare veche", tip: "Binecuvântare copil", data: "2020-05-03", invitat: "Pastor Ionescu" }));
    expect(r?.errors?.titlu).toBeUndefined();
    expect((await prisma.event.findUniqueOrThrow({ where: { id: old.id } })).invitat).toBe("Pastor Ionescu");
  });
});
