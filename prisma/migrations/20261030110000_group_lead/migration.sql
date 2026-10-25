-- A group's responsible person from the register (responsabilId), next to the old free text.
-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "responsabilId" TEXT;

-- CreateIndex
CREATE INDEX "groups_responsabilId_idx" ON "groups"("responsabilId");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_responsabilId_fkey" FOREIGN KEY ("responsabilId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: the free text names exactly one active person of the church (diacritics, case, word order
-- and hyphens ignored, as nameKey() in src/lib/name-match.ts) → linked; otherwise the text stays alone.
WITH gk AS (
  SELECT g."id", g."churchId",
    (SELECT string_agg(w, ' ' ORDER BY w COLLATE "C") FROM regexp_split_to_table(lower(translate(g."responsabil", 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')), '[\s-]+') AS w WHERE w <> '') AS k
  FROM "groups" g
  WHERE btrim(g."responsabil") <> '' AND g."responsabilId" IS NULL
), pk AS (
  SELECT p."id", p."churchId",
    (SELECT string_agg(w, ' ' ORDER BY w COLLATE "C") FROM regexp_split_to_table(lower(translate(p."prenume" || ' ' || p."nume", 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')), '[\s-]+') AS w WHERE w <> '') AS k
  FROM "persons" p
  WHERE p."statut" <> 'FOST_MEMBRU' AND p."dataIesire" IS NULL AND p."nume" <> 'Persoană ștearsă'
), m AS (
  SELECT gk."id" AS group_id, min(pk."id") AS person_id
  FROM gk JOIN pk ON pk."churchId" = gk."churchId" AND pk.k = gk.k
  GROUP BY gk."id"
  HAVING count(*) = 1
)
UPDATE "groups" g SET "responsabilId" = m.person_id FROM m WHERE g."id" = m.group_id;
