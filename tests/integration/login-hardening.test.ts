import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkPassword } from "@/server/login";
import { hashPassword } from "@/server/password";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

// checkPassword uses the global client; point it at the test database.
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));

describe.skipIf(!hasTestDb)("login: no account enumeration", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);

  beforeAll(async () => {
    await resetDatabase(prisma);
    const church = await prisma.church.create({ data: { nume: "Betel", slug: "betel-login" } });
    const passwordHash = await hashPassword("parola-corecta-1");
    await prisma.user.create({
      data: { churchId: church.id, email: "blocat@example.org", name: "B", passwordHash, role: "SECRETAR", failedLoginCount: 5, lastFailedLoginAt: new Date() },
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  async function timed(email: string, password: string) {
    const t = performance.now();
    const r = await checkPassword(email, password);
    return { reason: r.ok ? "ok" : r.reason, ms: performance.now() - t };
  }

  it("a locked account and an unknown address get the same answer and similar work", async () => {
    const unknown = await timed("nimeni@example.org", "orice-parola-1");
    const locked = await timed("blocat@example.org", "parola-gresita-1");
    expect(unknown.reason).toBe("invalid");
    expect(locked.reason).toBe("invalid");
    // Both run one scrypt check (tens of ms); neither answers instantly.
    expect(Math.min(unknown.ms, locked.ms)).toBeGreaterThan(Math.max(unknown.ms, locked.ms) / 4);
  });

  it("only the right password learns about the lock", async () => {
    expect((await timed("blocat@example.org", "parola-corecta-1")).reason).toBe("locked");
  });
});
