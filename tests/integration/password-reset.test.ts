import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requestPasswordReset, SELF_SERVICE_RESET_HOURS } from "@/server/password-reset";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

// Fake Resend SDK: the e-mail module runs for real, the network is never touched.
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const APP_URL = "https://secretariat.example.org";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** The raw token from the link in the last e-mail sent. */
function tokenFromLastEmail(): string {
  const text: string = send.mock.calls.at(-1)![0].text;
  const match = text.match(new RegExp(`${APP_URL}/resetare-parola/([A-Za-z0-9_-]+)`));
  expect(match).not.toBeNull();
  return match![1];
}

describe.skipIf(!hasTestDb)("forgot password: requestPasswordReset", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let userId: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const church = await prisma.church.create({ data: { nume: "Maranata Stavanger" } });
    userId = (
      await prisma.user.create({
        data: { churchId: church.id, email: "ana@example.org", name: "Ana Pop", passwordHash: "x", role: "SECRETAR" },
      })
    ).id;
    await prisma.user.create({
      data: { churchId: church.id, email: "fost@example.org", name: "Fost", passwordHash: "x", role: "SECRETAR", active: false },
    });
  });

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "re_test_fake_key_not_real");
    vi.stubEnv("APP_URL", APP_URL);
    send.mockReset();
    send.mockResolvedValue({ data: { id: "em_1" }, error: null, headers: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("stores only the hash of the token and e-mails the link", async () => {
    const before = Date.now();
    await expect(requestPasswordReset("ana@example.org", prisma)).resolves.toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe("ana@example.org");
    const token = tokenFromLastEmail();
    const rows = await prisma.passwordReset.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(sha256(token));
    expect(rows[0].tokenHash).not.toContain(token);
    expect(rows[0].usedAt).toBeNull();
    const validMs = rows[0].expiresAt.getTime() - before;
    expect(validMs).toBeGreaterThan(SELF_SERVICE_RESET_HOURS * 3_600_000 - 60_000);
    expect(validMs).toBeLessThanOrEqual(SELF_SERVICE_RESET_HOURS * 3_600_000 + 60_000);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: userId }, orderBy: { createdAt: "desc" } });
    expect(audit?.changes).toEqual({ sursa: "cerere „Am uitat parola”" });
  });

  it("a new request invalidates the previous link", async () => {
    await requestPasswordReset("ana@example.org", prisma);
    const latest = sha256(tokenFromLastEmail());
    const open = await prisma.passwordReset.findMany({ where: { userId, usedAt: null } });
    expect(open.map((r) => r.tokenHash)).toEqual([latest]);
  });

  it("unknown or deactivated accounts get no e-mail and no token", async () => {
    const count = await prisma.passwordReset.count();
    await expect(requestPasswordReset("nimeni@example.org", prisma)).resolves.toBe("no-account");
    await expect(requestPasswordReset("fost@example.org", prisma)).resolves.toBe("no-account");
    expect(send).not.toHaveBeenCalled();
    expect(await prisma.passwordReset.count()).toBe(count);
  });

  it("without e-mail configured nothing is created", async () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    const count = await prisma.passwordReset.count();
    await expect(requestPasswordReset("ana@example.org", prisma)).resolves.toBe("disabled");
    expect(send).not.toHaveBeenCalled();
    expect(await prisma.passwordReset.count()).toBe(count);
  });
});
