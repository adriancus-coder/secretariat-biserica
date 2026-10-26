import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

/** The NOTICE-1.0 data migration, run again: draft versions on churches become 1.0; answers are only counted. */
const sql = readFileSync("prisma/migrations/20261112100000_notice_1_0/migration.sql", "utf8");

describe.skipIf(!hasTestDb)("migration notice_1_0", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase(prisma);
    for (const [slug, privacyVersion] of [["a", "1.1"], ["b", "1.2"], ["c", ""], ["d", "1.0"]] as const) {
      ids[slug] = (await prisma.church.create({ data: { nume: slug, slug, privacyVersion } })).id;
    }
    const person = await prisma.person.create({ data: { churchId: ids.a, nume: "Pop", prenume: "Ana" } });
    await prisma.consent.create({ data: { churchId: ids.a, personId: person.id, kind: "PHOTOS", granted: true, textVersion: "1.2", givenAt: new Date(), source: "ONLINE" } });
    await prisma.consent.create({ data: { churchId: ids.a, personId: person.id, kind: "BIRTHDAY", granted: false, textVersion: "1.1", givenAt: new Date(), source: "PAPER" } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("moves the churches' draft versions to 1.0, keeps every consent as it was, and is idempotent", async () => {
    for (let i = 0; i < 2; i++) await prisma.$executeRawUnsafe(sql);
    const churches = Object.fromEntries((await prisma.church.findMany()).map((c) => [c.slug, c.privacyVersion]));
    expect(churches).toEqual({ a: "1.0", b: "1.0", c: "", d: "1.0" });
    expect((await prisma.consent.findMany({ orderBy: { kind: "asc" } })).map((c) => c.textVersion).sort()).toEqual(["1.1", "1.2"]);
  });
});
