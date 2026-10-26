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
vi.mock("@/server/step-up", () => ({ hasStepUp: async () => true, STEP_UP_REQUIRED: "Confirmați identitatea." }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { setDisciplineAccessAction } = await import("@/server/actions/users");
const { permissions } = await import("@/lib/permissions");

/** DISCIPLINE-ACCESS (Statut art. 44 lit. d; art. 14 alin. 3 lit. d): who gives the access, to whom, audited. */
describe.skipIf(!hasTestDb)("access to the disciplinary measures", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const id: Record<string, string> = {};
  let church = "";
  let lone = "";
  const as = async (key: string): Promise<Ctx> => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: id[key] } });
    return { user: { ...u, churchName: "X" }, db: scopeToChurch(prisma, u.churchId) } as unknown as Ctx;
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    church = (await prisma.church.create({ data: { nume: "a", slug: "acces-a" } })).id;
    lone = (await prisma.church.create({ data: { nume: "b", slug: "acces-b" } })).id;
    const mk = async (key: string, churchId: string, role: "ADMIN" | "SECRETAR" | "VIZUALIZARE", extra: object = {}) =>
      (id[key] = (await prisma.user.create({ data: { churchId, email: `${key}@x.ro`, name: key, passwordHash: "x", role, ...extra } })).id);
    await mk("pastor", church, "SECRETAR", { isPastor: true });
    await mk("admin", church, "ADMIN", { accesDisciplina: true });
    await mk("secretar", church, "SECRETAR");
    await mk("viewer", church, "VIZUALIZARE");
    await mk("loneAdmin", lone, "ADMIN", { accesDisciplina: true });
    await mk("loneAdmin2", lone, "ADMIN");
    await mk("loneSecretar", lone, "SECRETAR");
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("an Administrator without access sees nothing; a pastor sees", async () => {
    expect(permissions.disciplina((await as("secretar")).user)).toBe(false);
    expect(permissions.disciplina({ role: "ADMIN" })).toBe(false);
    expect(permissions.disciplina((await as("pastor")).user)).toBe(true);
  });

  it("a pastor gives the access to a Secretar, who then sees; audited SECURITY with who, to whom", async () => {
    current = await as("pastor");
    expect((await setDisciplineAccessAction(id.secretar, true)).ok).toBe(true);
    const s = await as("secretar");
    expect(permissions.disciplina(s.user)).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: id.secretar } });
    expect([row.accesDisciplinaDeLa, row.accesDisciplinaLa !== null]).toEqual([id.pastor, true]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "SECURITY", entityId: id.secretar } });
    expect([audit.userId, JSON.stringify(audit.changes)]).toEqual([id.pastor, expect.stringContaining("acces la măsurile disciplinare acordat de pastor")]);
    // Never to a viewer.
    expect((await setDisciplineAccessAction(id.viewer, true)).message).toBe("Accesul se dă doar unui Administrator sau Secretar activ.");
    // And taken back.
    expect((await setDisciplineAccessAction(id.secretar, false)).ok).toBe(true);
    expect(permissions.disciplina((await as("secretar")).user)).toBe(false);
  });

  it("with a pastor in the church, an Administrator (even with access) cannot give it, nor to himself", async () => {
    current = await as("admin");
    expect((await setDisciplineAccessAction(id.secretar, true)).message).toBe("Accesul la măsurile disciplinare îl dă un pastor (Statut art. 44 lit. d).");
    current = await as("pastor");
    expect((await setDisciplineAccessAction(id.pastor, true)).message).toBe("Nu vă puteți da singur acces la măsurile disciplinare.");
  });

  it("a church without a pastor: an Administrator with access gives it; one without cannot", async () => {
    current = await as("loneAdmin");
    expect((await setDisciplineAccessAction(id.loneSecretar, true)).ok).toBe(true);
    expect((await setDisciplineAccessAction(id.loneAdmin, false)).message).toBe("Nu vă puteți da singur acces la măsurile disciplinare.");
    current = await as("loneAdmin2");
    expect((await setDisciplineAccessAction(id.loneSecretar, false)).message).toBe(
      "Biserica nu are un pastor în aplicație; accesul îl poate da doar un administrator care are el însuși acces.",
    );
  });
});
