import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson } from "@/domain/backup";
import { parseMeetingExtras } from "@/lib/meeting-backup";
import { importBackup } from "@/server/backup";
import { lockMeetingRegister, nextFreeMeetingNumber } from "@/server/doc-numbering";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("minutes register numbering", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let churchA: string;
  let churchB: string;
  let ctxA: Ctx;

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchA = (await prisma.church.create({ data: { nume: "A", slug: "biserica-a" } })).id;
    churchB = (await prisma.church.create({ data: { nume: "B", slug: "biserica-b" } })).id;
    const user = await prisma.user.create({ data: { churchId: churchA, email: "a@x.ro", name: "A", passwordHash: "x", role: "ADMIN" } });
    ctxA = {
      user: { id: user.id, name: "A", email: "a@x.ro", role: "ADMIN", churchId: churchA, churchName: "A" },
      db: scopeToChurch(prisma, churchA),
    } as Ctx;
  });
  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  async function hold(churchId: string, year: number) {
    return prisma.$transaction(async (tx) => {
      await lockMeetingRegister(tx, churchId, year);
      const nr = await nextFreeMeetingNumber(tx, churchId, year);
      await tx.meeting.create({ data: { churchId, tip: "Comitet", data: new Date(`${year}-05-01`), nr, anRegistru: year } });
      return nr;
    });
  }

  it("simultaneous meetings get distinct, consecutive numbers; separate per church and year", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => hold(churchA, 2026)));
    expect([...results].sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(await hold(churchB, 2026)).toBe(1);
    expect(await hold(churchA, 2027)).toBe(1);
  });

  it("the database refuses a duplicate number in the same year", async () => {
    await expect(
      prisma.meeting.create({ data: { churchId: churchA, tip: "Comitet", data: new Date("2026-06-01"), nr: 1, anRegistru: 2026 } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("import keeps free numbers, leaves taken ones out, and turns old texts into points", async () => {
    const json = {
      meetings: {
        m1: { id: "m1", tip: "Comitet", data: "2026-09-11", prezenti: [], nr: 16, puncte: ["Unu", "Doi"], formulaIncheiere: "Gata." },
        m2: { id: "m2", tip: "Comitet", data: "2026-08-16", prezenti: [], nr: 3 },
        m3: { id: "m3", tip: "Comitet", data: "2025-01-10", prezenti: [], hotarari: "Intro\n1. A\n2. B", discutii: "S-a discutat." },
      },
    };
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const summary = await importBackup(ctxA, parsed.backup, "merge", { meetings: parseMeetingExtras(json) });
    expect(summary.avertismente.join(" ")).toContain("3/2026");
    const rows = await ctxA.db.meeting.findMany({ where: { id: { in: ["m1", "m2", "m3"] } }, orderBy: { data: "desc" } });
    expect(rows.map((m) => [m.id, m.nr, m.anRegistru, m.puncte, m.observatii, m.formulaIncheiere, m.hotarari, m.discutii])).toEqual([
      ["m1", 16, 2026, ["Unu", "Doi"], "", "Gata.", "", ""],
      ["m2", null, null, [], "", "Toate punctele au fost votate în unanimitate de membrii prezenți.", "", ""],
      ["m3", null, null, ["A", "B"], "Intro\n\nDiscuții:\nS-a discutat.", "Toate punctele au fost votate în unanimitate de membrii prezenți.", "", ""],
    ]);
  });
});
