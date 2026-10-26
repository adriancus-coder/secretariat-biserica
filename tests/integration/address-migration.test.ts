import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

/** The data part of the migration (from the helper function on), run again over rows in the old format. */
const sql = readFileSync("prisma/migrations/20261110120000_address_format/migration.sql", "utf8");
const dataMigration = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION pg_temp.cap_if_lower"));

describe.skipIf(!hasTestDb)("migration address_format", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let churchId: string;

  async function run() {
    await prisma.$executeRawUnsafe(dataMigration);
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Maranata", slug: "maranata", adresa: "storgata 5, 4005 stavanger" } })).id;
    const mk = (nume: string, adresa: string) => prisma.person.create({ data: { churchId, nume, adresa } });
    await mk("A", "ulveveien 20  4323 sandnes");
    await mk("B", "Ulveveien 20, 4323 Sandnes");
    await mk("C", "Ulveveien 20 B,   4323   SANDNES");
    await mk("D", "Ulveveien 20, Sandnes");
    await mk("E", "");
    await prisma.family.create({ data: { churchId, nume: "Fam. A", adresa: "kirkegata 1,4010 stavanger" } });
    await prisma.application.create({ data: { churchId, kind: "BOTEZ", nume: "X", adresa: "Undeva" } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("splits the old format, leaves the rest whole, and is idempotent", async () => {
    await run();
    const rows = Object.fromEntries((await prisma.person.findMany({ where: { churchId } })).map((p) => [p.nume, [p.adresa, p.codPostal, p.localitate]]));
    expect(rows.A).toEqual(["Ulveveien 20", "4323", "Sandnes"]);
    expect(rows.B).toEqual(["Ulveveien 20", "4323", "Sandnes"]);
    expect(rows.C).toEqual(["Ulveveien 20 B", "4323", "SANDNES"]);
    expect(rows.D).toEqual(["Ulveveien 20, Sandnes", "", ""]);
    expect(rows.E).toEqual(["", "", ""]);
    const fam = await prisma.family.findFirstOrThrow({ where: { churchId } });
    expect([fam.adresa, fam.codPostal, fam.localitate]).toEqual(["Kirkegata 1", "4010", "Stavanger"]);
    const church = await prisma.church.findUniqueOrThrow({ where: { id: churchId } });
    expect([church.adresa, church.codPostal, church.localitate]).toEqual(["Storgata 5", "4005", "Stavanger"]);
    const app = await prisma.application.findFirstOrThrow({ where: { churchId } });
    expect([app.adresa, app.codPostal]).toEqual(["Undeva", ""]);

    await run(); // a second run changes nothing
    const again = Object.fromEntries((await prisma.person.findMany({ where: { churchId } })).map((p) => [p.nume, [p.adresa, p.codPostal, p.localitate]]));
    expect(again).toEqual(rows);
  });
});
