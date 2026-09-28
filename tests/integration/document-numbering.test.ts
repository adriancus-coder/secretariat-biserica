import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockDocumentRegister, nextFreeNumber } from "@/server/doc-numbering";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

describe.skipIf(!hasTestDb)("numerotarea registrului de ieșire", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let churchA: string;
  let churchB: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchA = (await prisma.church.create({ data: { nume: "A" } })).id;
    churchB = (await prisma.church.create({ data: { nume: "B" } })).id;
  });
  afterAll(async () => {
    await resetDatabase(prisma);
  });

  async function issue(churchId: string, year: number) {
    return prisma.$transaction(async (tx) => {
      await lockDocumentRegister(tx, churchId, year);
      const nr = await nextFreeNumber(tx, churchId, year);
      await tx.document.create({
        data: { churchId, tip: "adeverinta", nr, anRegistru: year, data: new Date(`${year}-05-01`), text: "x" },
      });
      return nr;
    });
  }

  it("alocările simultane primesc numere distincte, consecutive", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => issue(churchA, 2026)));
    expect([...results].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it("numerotarea e separată pe biserică și pe an", async () => {
    expect(await issue(churchB, 2026)).toBe(1);
    expect(await issue(churchA, 2027)).toBe(1);
    expect(await issue(churchA, 2026)).toBe(13);
  });

  it("baza de date respinge un număr duplicat în același an", async () => {
    await expect(
      prisma.document.create({
        data: { churchId: churchA, tip: "botez", nr: 1, anRegistru: 2026, data: new Date("2026-06-01"), text: "y" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
