-- A group's ministry (functieId) and leader role (functieLiderId), both optional links to church roles.
-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "functieId" TEXT,
ADD COLUMN     "functieLiderId" TEXT;

-- CreateIndex
CREATE INDEX "groups_functieId_idx" ON "groups"("functieId");

-- CreateIndex
CREATE INDEX "groups_functieLiderId_idx" ON "groups"("functieLiderId");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_functieId_fkey" FOREIGN KEY ("functieId") REFERENCES "church_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_functieLiderId_fkey" FOREIGN KEY ("functieLiderId") REFERENCES "church_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: a group named like exactly one active role of its church (case and diacritics ignored,
-- spaces collapsed, as roleKey() in src/lib/roles.ts) belongs to that ministry. Other groups stay unlinked.
UPDATE "groups" g SET "functieId" = m.role_id
FROM (
  SELECT g2."id" AS group_id, min(r."id") AS role_id
  FROM "groups" g2
  JOIN "church_roles" r ON r."churchId" = g2."churchId" AND r."active"
    AND lower(regexp_replace(btrim(translate(r."nume", 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(translate(g2."nume", 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')), '\s+', ' ', 'g'))
  GROUP BY g2."id"
  HAVING count(*) = 1
) m
WHERE g."id" = m.group_id AND g."functieId" IS NULL;
