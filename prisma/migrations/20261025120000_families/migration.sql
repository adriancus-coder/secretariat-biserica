-- Families become records defined by their head. The free-text Person.familie is kept as
-- "familieVeche" for one release (a later migration drops it).

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'FAMILY';

-- CreateTable
CREATE TABLE "families" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "headId" TEXT,
    "adresa" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- Keep the old text
DROP INDEX "persons_churchId_familie_idx";
ALTER TABLE "persons" RENAME COLUMN "familie" TO "familieVeche";
ALTER TABLE "persons" ADD COLUMN "familyId" TEXT;

-- Backfill: one family per distinct family text per church. The head is the person with
-- rudenie "Cap de familie" (the oldest if several), else the oldest adult man, else the oldest
-- adult, else the oldest person. Mirrors pickHead() / defaultFamilyName() in src/lib/families.ts.
DO $$
DECLARE
  grp RECORD;
  head RECORD;
  fam_id TEXT;
BEGIN
  FOR grp IN
    SELECT "churchId", "familieVeche" AS fam FROM "persons" WHERE btrim("familieVeche") <> '' GROUP BY "churchId", "familieVeche"
  LOOP
    SELECT p."id", p."nume", p."prenume", p."adresa" INTO head
    FROM "persons" p
    WHERE p."churchId" = grp."churchId" AND p."familieVeche" = grp.fam
    ORDER BY
      (p."rudenie" = 'Cap de familie') DESC,
      (p."dataNasterii" IS NOT NULL AND p."dataNasterii" <= CURRENT_DATE - INTERVAL '18 years' AND p."gen" = 'M') DESC,
      (p."dataNasterii" IS NOT NULL AND p."dataNasterii" <= CURRENT_DATE - INTERVAL '18 years') DESC,
      p."dataNasterii" ASC NULLS LAST,
      p."createdAt" ASC,
      p."id" ASC
    LIMIT 1;
    fam_id := gen_random_uuid()::text;
    INSERT INTO "families" ("id", "churchId", "nume", "headId", "adresa", "updatedAt")
    VALUES (fam_id, grp."churchId", 'Fam. ' || btrim(head."prenume" || ' ' || head."nume"), head."id", head."adresa", CURRENT_TIMESTAMP);
    UPDATE "persons" SET "familyId" = fam_id WHERE "churchId" = grp."churchId" AND "familieVeche" = grp.fam;
  END LOOP;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "families_headId_key" ON "families"("headId");
CREATE INDEX "families_churchId_nume_idx" ON "families"("churchId", "nume");
CREATE INDEX "persons_churchId_familyId_idx" ON "persons"("churchId", "familyId");

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "families" ADD CONSTRAINT "families_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "families" ADD CONSTRAINT "families_headId_fkey" FOREIGN KEY ("headId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
